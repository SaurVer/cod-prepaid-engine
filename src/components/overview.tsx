'use client';

// Overview: all 30 days are loaded once; range, filters, custom dates and opening a day all happen in the
// browser, so switching is instant. The URL is kept in sync so links and Back work.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { campaignName, dayLabel, inr, num, pct, weekday } from '@/lib/format';
import type { CostInputs, DayCampaign, DaySummary } from '@/lib/server/results.ts';
import { CampaignProgress, RunCampaignButton } from './campaign-actions';
import { DailyChart } from './charts';
import { ExtraProfitExplainer } from './explain';
import { Badge, Tile } from './ui';

type Status = 'running' | 'review' | 'sent' | 'open' | 'live' | 'done';
type Show = 'all' | 'sent' | 'open';
type Range = '7' | '14' | '30' | 'custom';

const ACTIVE = ['queued', 'scoring', 'deciding', 'drafting'];

function dayStatus(d: DaySummary): Status {
  const c = d.campaigns;
  if (c.some((x) => ACTIVE.includes(x.status))) return 'running';
  if (c.some((x) => x.status === 'ready_for_review')) return 'review';
  if (c.some((x) => x.status === 'sent')) return 'sent';
  if (d.ready > 0) return 'open';
  return d.past ? 'done' : 'live';
}

function badgeFor(d: DaySummary): { label: string; tone: 'green' | 'blue' | 'amber' | 'gray' | 'violet' } {
  switch (dayStatus(d)) {
    case 'running':
      return { label: 'Campaign running', tone: 'blue' };
    case 'review':
      return { label: 'Ready to review', tone: 'violet' };
    case 'sent':
      return { label: d.campaigns.some((c) => c.replay) ? 'Replayed & sent' : 'Campaign sent', tone: 'green' };
    case 'open':
      return d.past ? { label: 'Not run yet', tone: 'amber' } : { label: 'Ready for a campaign', tone: 'amber' };
    case 'live':
      return { label: 'Orders arriving', tone: 'blue' };
    default:
      return { label: 'Nothing to run', tone: 'gray' };
  }
}

function extraProfit(d: DaySummary): { value: number | null; resolved: number; sent: boolean } {
  const sent = d.campaigns.filter((c) => c.status === 'sent');
  if (!sent.length) return { value: null, resolved: 0, sent: false };
  const resolved = sent.reduce((a, c) => a + c.resolved_share, 0) / sent.length;
  if (sent.some((c) => c.extra_total == null)) return { value: null, resolved, sent: true };
  return { value: sent.reduce((a, c) => a + (c.extra_total ?? 0), 0), resolved, sent: true };
}

function costFor(cost: CostInputs, orders: number) {
  const gap = Math.max(0, cost.cod_rto_rate - cost.prepaid_rto_rate);
  const cash = orders * cost.cod_fee;
  const returns = orders * gap * cost.rto_cost;
  return { orders, gap, cash, returns, total: cash + returns };
}

const GRID = 'grid grid-cols-[160px_1fr_1fr_1fr_180px_1fr_1.2fr_28px] items-center gap-3';

const KEY = 'payshift-overview';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function shortInr(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '+';
  if (a >= 100000) return `${s}₹${(a / 100000).toFixed(1)}L`;
  if (a >= 1000) return `${s}₹${(a / 1000).toFixed(1)}k`;
  return `${s}₹${Math.round(a)}`;
}

function addDaysKey(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** Calendar of the last 30 days, Monday-first weeks. Each day shows its campaign status. */
function Calendar({
  days,
  selected,
  inRange,
  onPick,
}: {
  days: DaySummary[];
  selected: string | null;
  inRange: Set<string>;
  onPick: (date: string) => void;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const oldest = days[days.length - 1]?.date;
  const newest = days[0]?.date;
  if (!oldest || !newest) return null;
  const dow = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const start = addDaysKey(oldest, -dow(oldest));
  const end = addDaysKey(newest, 6 - dow(newest));
  const cells: string[] = [];
  for (let d = start; d <= end; d = addDaysKey(d, 1)) cells.push(d);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];
  const label = month(oldest) === month(newest) ? `${month(newest)} ${newest.slice(0, 4)}` : `${month(oldest)} – ${month(newest)} ${newest.slice(0, 4)}`;
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-ink-soft">{label}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-0.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.04em] text-ink-faint">
            {w}
          </div>
        ))}
        {cells.map((date) => {
          const d = byDate.get(date);
          if (!d) return <div key={date} className="h-[58px] rounded-lg" />;
          const s = dayStatus(d);
          const ep = extraProfit(d);
          const active = selected === date;
          const dim = !inRange.has(date);
          const tag =
            s === 'sent'
              ? ep.value != null
                ? { t: shortInr(ep.value), c: ep.value >= 0 ? 'text-ok' : 'text-bad' }
                : { t: 'Measuring', c: 'text-ok' }
              : s === 'open'
                ? { t: d.past ? 'Not run' : 'Ready', c: 'text-warn' }
                : s === 'running'
                  ? { t: 'Running', c: 'text-rzp' }
                  : s === 'review'
                    ? { t: 'Review', c: 'text-[#6B4BD8]' }
                    : s === 'live'
                      ? { t: 'Live', c: 'text-rzp' }
                      : { t: '—', c: 'text-ink-faint' };
          const bar = { sent: 'bg-ok', open: 'bg-warn', running: 'bg-rzp', review: 'bg-[#6B4BD8]', live: 'bg-rzp', done: 'bg-line' }[s];
          return (
            <button
              key={date}
              onClick={() => onPick(date)}
              title={`${weekday(date)} ${dayLabel(date)}`}
              className={`relative flex h-[58px] flex-col items-start justify-between overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-colors ${
                active ? 'border-rzp bg-rzp text-white shadow-pop' : 'border-line bg-white hover:border-rzp/50'
              } ${dim && !active ? 'opacity-45' : ''}`}
            >
              <span className={`absolute inset-x-0 top-0 h-[3px] ${active ? 'bg-white/60' : bar}`} />
              <span className="flex w-full items-center justify-between">
                <span className="text-[14px] font-semibold tabular-nums">{Number(date.slice(8))}</span>
                {!d.past && <span className={`text-[9.5px] font-semibold uppercase ${active ? 'text-white/80' : 'text-rzp'}`}>Today</span>}
              </span>
              <span className={`text-[11px] font-medium tabular-nums ${active ? 'text-white/85' : tag.c}`}>{tag.t}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
        {[
          ['bg-warn', 'Not run yet'],
          ['bg-ok', 'Campaign sent (extra profit)'],
          ['bg-[#6B4BD8]', 'Ready to review'],
          ['bg-rzp', 'Today / running'],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${c}`} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Today at a glance, with the next action. */
function TodayStrip({ d, cost, onOpen }: { d: DaySummary | undefined; cost: CostInputs; onOpen: () => void }) {
  if (!d || d.past) return null;
  const s = dayStatus(d);
  const stake = costFor(cost, d.ready);
  const review = d.campaigns.find((c) => c.status === 'ready_for_review');
  const running = d.campaigns.find((c) => ACTIVE.includes(c.status));
  return (
    <div className="card flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5">
      <div>
        <div className="label">Today so far</div>
        <div className="mt-0.5 text-[13px] text-ink-soft">
          <b className="text-ink">{num(d.total)}</b> orders · <b className="text-ink">{num(d.cod)}</b> cash on delivery ·{' '}
          <b className="text-ink">{num(d.ready)}</b> ready for a campaign
        </div>
      </div>
      {d.ready > 0 && (
        <div>
          <div className="label">At stake if they stay COD</div>
          <div className="mt-0.5 text-[15px] font-semibold">{inr(stake.total)}</div>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {running ? (
          <Link href={`/campaigns/${running.id}`} className="btn">
            Campaign running · {Math.round(running.progress)}%
          </Link>
        ) : review ? (
          <Link href={`/campaigns/${review.id}`} className="btn btn-primary">
            Review &amp; send today&apos;s campaign →
          </Link>
        ) : s === 'open' ? (
          <RunCampaignButton
            date={d.date}
            ready={d.ready}
            past={false}
            defaults={{ holdout_pct: cost.holdout_pct, exploration_pct: cost.exploration_pct }}
            label="Run today's campaign"
          />
        ) : null}
        <button className="btn" onClick={onOpen}>
          Open today
        </button>
      </div>
    </div>
  );
}

export function OverviewClient({
  days,
  cost,
  initial,
}: {
  days: DaySummary[];
  cost: CostInputs;
  initial: { date?: string; range?: string; show?: string; from?: string; to?: string };
}) {
  const oldest = days[days.length - 1]?.date ?? '';
  const newest = days[0]?.date ?? '';
  const [range, setRange] = useState<Range>((['7', '14', '30', 'custom'].includes(initial.range ?? '') ? initial.range : '14') as Range);
  const [from, setFrom] = useState(initial.from && initial.from >= oldest ? initial.from : days[Math.min(6, days.length - 1)]?.date ?? oldest);
  const [to, setTo] = useState(initial.to && initial.to <= newest ? initial.to : newest);
  const [show, setShow] = useState<Show>((['all', 'sent', 'open'].includes(initial.show ?? '') ? initial.show : 'all') as Show);
  const [selected, setSelected] = useState<string | null>(initial.date && initial.date !== 'none' ? initial.date : null);
  const [explain, setExplain] = useState(false);
  const [restored, setRestored] = useState(false);

  // Coming back to the Overview (no state in the URL): reopen what was open before.
  useEffect(() => {
    const hasUrlState = Boolean(initial.date || initial.range || initial.show);
    if (!hasUrlState) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
        if (saved) {
          if (['7', '14', '30', 'custom'].includes(saved.range)) setRange(saved.range);
          if (saved.from) setFrom(saved.from);
          if (saved.to) setTo(saved.to);
          if (['all', 'sent', 'open'].includes(saved.show)) setShow(saved.show);
          if (saved.selected && days.some((d) => d.date === saved.selected)) setSelected(saved.selected);
        }
      } catch {
        /* storage unavailable */
      }
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inRange = useMemo(
    () => (range === 'custom' ? days.filter((d) => d.date >= from && d.date <= to) : days.slice(0, Number(range))),
    [days, range, from, to],
  );
  const inRangeSet = useMemo(() => new Set(inRange.map((d) => d.date)), [inRange]);
  const visible = useMemo(
    () =>
      inRange.filter((d) => {
        const s = dayStatus(d);
        if (show === 'sent') return s === 'sent';
        if (show === 'open') return s === 'open' || s === 'review';
        return true;
      }),
    [inRange, show],
  );
  const open = selected === null ? null : (visible.find((d) => d.date === selected) ?? null);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    q.set('range', range);
    if (range === 'custom') {
      q.set('from', from);
      q.set('to', to);
    }
    if (show !== 'all') q.set('show', show);
    q.set('date', selected ?? 'none');
    return q.toString();
  }, [range, from, to, show, selected]);
  useEffect(() => {
    if (!restored) return;
    window.history.replaceState(window.history.state, '', `/?${query}`);
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ range, from, to, show, selected }));
    } catch {
      /* storage unavailable */
    }
  }, [query, restored, range, from, to, show, selected]);
  const back = encodeURIComponent(`/?${query}`);

  const pick = (date: string) => {
    if (!inRangeSet.has(date)) setRange('30');
    setShow('all');
    setSelected(date);
    setTimeout(() => document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const glance = useMemo(() => {
    const measured = inRange.filter((d) => extraProfit(d).value != null);
    return {
      cod: inRange.reduce((a, d) => a + d.cod, 0),
      messaged: inRange.reduce((a, d) => a + d.messaged, 0),
      paid: inRange.reduce((a, d) => a + d.paid_after_msg, 0),
      extra: measured.reduce((a, d) => a + (extraProfit(d).value ?? 0), 0),
      measuredDays: measured.length,
      measuringDays: inRange.filter((d) => extraProfit(d).sent && extraProfit(d).value == null).length,
      from: inRange[inRange.length - 1]?.date,
      to: inRange[0]?.date,
    };
  }, [inRange]);
  const rangeQs = glance.from ? `&from=${glance.from}&to=${glance.to}` : '';
  const rangeLabel = range === 'custom' ? `${dayLabel(glance.from)} – ${dayLabel(glance.to)}` : `last ${range} days`;

  const seg = (active: boolean) =>
    `rounded-md px-3 py-1 text-[12.5px] transition-colors ${active ? 'bg-white font-medium text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`;

  return (
    <div className="space-y-5">
      <TodayStrip d={days[0]} cost={cost} onOpen={() => pick(newest)} />

      <div className="grid grid-cols-12 gap-4">
        {/* Calendar */}
        <div className="card col-span-5 px-4 py-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h2>Days</h2>
            <span className="text-[12px] text-ink-faint">Click a day to open it</span>
          </div>
          <Calendar days={days} selected={open?.date ?? null} inRange={inRangeSet} onPick={pick} />
        </div>

        {/* Range, totals and trend */}
        <div className="card col-span-7 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex rounded-lg border border-line bg-panel p-0.5">
              {(['7', '14', '30'] as const).map((r) => (
                <button key={r} className={seg(range === r)} onClick={() => setRange(r)}>
                  {r} days
                </button>
              ))}
              <button className={seg(range === 'custom')} onClick={() => setRange('custom')}>
                Custom
              </button>
            </div>
            {range === 'custom' && (
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <input type="date" className="input py-1" min={oldest} max={to} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="From" />
                <span className="text-ink-faint">to</span>
                <input type="date" className="input py-1" min={from} max={newest} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="To" />
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {[
              { l: 'COD orders', v: num(glance.cod), href: `/orders?view=cod${rangeQs}&back=${back}` },
              { l: 'Orders messaged', v: num(glance.messaged), href: `/orders?view=messaged${rangeQs}&back=${back}` },
              { l: 'Paid online after a message', v: num(glance.paid), href: `/orders?view=paid${rangeQs}&back=${back}`, tone: 'text-rzp' },
            ].map((t) => (
              <Link key={t.l} href={t.href} className="group rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-rzp/40">
                <div className="text-[11px] font-medium text-ink-faint">{t.l}</div>
                <div className={`mt-0.5 text-[20px] font-semibold tabular-nums ${t.tone ?? ''}`}>{t.v}</div>
              </Link>
            ))}
            <div className="rounded-lg border border-line px-3 py-2.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-ink-faint">
                Extra profit vs control
                <button className="text-rzp hover:underline" onClick={() => setExplain((x) => !x)}>
                  {explain ? 'Hide' : 'How?'}
                </button>
              </div>
              <div className={`mt-0.5 text-[20px] font-semibold tabular-nums ${glance.extra >= 0 ? 'text-ok' : 'text-bad'}`}>{inr(glance.extra)}</div>
              <div className="text-[11px] text-ink-faint">
                {glance.measuredDays} day{glance.measuredDays === 1 ? '' : 's'} measured{glance.measuringDays > 0 && ` · ${glance.measuringDays} measuring`}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-soft">Orders per day · {rangeLabel}</span>
          </div>
          <DailyChart data={inRange.slice().reverse().map((d) => ({ date: d.date, cod: d.cod, prepaid: d.prepaid, paid: d.paid_after_msg }))} />
        </div>
      </div>
      {explain && (
        <div className="card px-5 py-4">
          <h2 className="mb-2">How “Extra profit vs control” is worked out</h2>
          <ExtraProfitExplainer econ={cost} />
        </div>
      )}

      {/* Day list */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <h2>
            Day by day <span className="font-normal text-ink-faint">· {rangeLabel}</span>
          </h2>
          <div className="flex rounded-lg border border-line bg-panel p-0.5">
            {(
              [
                ['all', 'All days'],
                ['sent', 'Campaign sent'],
                ['open', 'Not run yet'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={seg(show === k)} onClick={() => setShow(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className={`${GRID} border-b border-line bg-panel px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] text-ink-faint`}>
          <span>Day</span>
          <span className="text-right">Orders</span>
          <span className="text-right">COD</span>
          <span className="text-right">Eligible</span>
          <span>Campaign</span>
          <span className="text-right">Paid online after msg</span>
          <span className="text-right">Extra profit vs control</span>
          <span />
        </div>
        {visible.length === 0 && <div className="px-5 py-6 text-[13px] text-ink-faint">No days match this filter.</div>}
        {visible.map((d) => {
          const isOpen = open?.date === d.date;
          const ep = extraProfit(d);
          const b = badgeFor(d);
          const row = (
            <button
              onClick={() => setSelected(isOpen ? null : d.date)}
              aria-expanded={isOpen}
              className={`${GRID} w-full px-5 py-3 text-left text-[13px] transition-colors ${isOpen ? 'bg-rzp-soft' : 'hover:bg-rzp-faint'}`}
            >
              <span>
                <span className={`font-semibold ${isOpen ? 'text-rzp' : ''}`}>{d.past ? weekday(d.date) : 'Today'}</span>
                <span className="ml-1.5 text-ink-soft">{dayLabel(d.date)}</span>
              </span>
              <span className="text-right tabular-nums">{num(d.total)}</span>
              <span className="text-right tabular-nums">{num(d.cod)}</span>
              <span className="text-right tabular-nums">{num(d.eligible)}</span>
              <span>
                <Badge tone={b.tone}>{b.label}</Badge>
              </span>
              <span className="text-right tabular-nums">{d.paid_after_msg ? num(d.paid_after_msg) : '—'}</span>
              <span className="text-right tabular-nums">
                {ep.value != null ? (
                  <span className={ep.value >= 0 ? 'font-medium text-ok' : 'font-medium text-bad'}>{inr(ep.value)}</span>
                ) : ep.sent ? (
                  <span className="text-ink-faint">Measuring · {pct(ep.resolved, 0)}</span>
                ) : (
                  '—'
                )}
              </span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[14px] transition-transform ${
                  isOpen ? 'rotate-90 bg-rzp text-white' : 'text-ink-faint'
                }`}
              >
                ›
              </span>
            </button>
          );
          return isOpen ? (
            <div key={d.date} id={`day-${d.date}`} className="relative scroll-mt-20 border-y-2 border-rzp/60 bg-rzp-faint shadow-pop">
              <span className="absolute inset-y-0 left-0 w-1 bg-rzp" />
              {row}
              <DayPanel d={d} cost={cost} back={back} />
            </div>
          ) : (
            <div key={d.date} id={`day-${d.date}`} className="scroll-mt-20 border-b border-line last:border-0">
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CampaignSummary({ c, back }: { c: DayCampaign; back: string }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          {campaignName(c.created_at)} <Badge tone="green">Sent</Badge>
          {c.replay && <Badge tone="amber">Replay</Badge>}
        </div>
        <Link href={`/campaigns/${c.id}?back=${back}`} className="link text-[12.5px]">
          View results →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-3 text-[12px]">
        {[
          ['Messages sent', num(c.sent)],
          ['Opened', num(c.opened)],
          ['Clicked', num(c.clicked)],
          ['Paid online', num(c.paid_online)],
          ['Extra profit vs control', c.extra_total == null ? `Measuring · ${pct(c.resolved_share, 0)}` : inr(c.extra_total)],
        ].map(([l, v]) => (
          <div key={l}>
            <div className="text-ink-faint">{l}</div>
            <div className="metric-sm mt-0.5">{v}</div>
          </div>
        ))}
      </div>
      {c.extra_total != null && c.ai_profit != null && c.control_profit != null && (
        <div className="mt-2 rounded-md bg-ok-soft px-3 py-1.5 text-[12px] text-ok">
          ({inr(c.ai_profit, 2)} per AI-decided order − {inr(c.control_profit, 2)} per control order) × {num(c.ai_n)} AI-decided orders ={' '}
          <b>{inr(c.extra_total)}</b>
        </div>
      )}
    </div>
  );
}

function DayPanel({ d, cost, back }: { d: DaySummary; cost: CostInputs; back: string }) {
  const prepaidShare = d.total ? d.prepaid / d.total : 0;
  const active = d.campaigns.filter((c) => ACTIVE.includes(c.status));
  const review = d.campaigns.filter((c) => c.status === 'ready_for_review');
  const sent = d.campaigns.filter((c) => c.status === 'sent');
  const atStake = costFor(cost, d.ready > 0 ? d.ready : d.eligible);
  const busy = active.length + review.length > 0;
  return (
    <div className="space-y-4 px-5 pb-5 pt-3">
      <div className="grid grid-cols-5 gap-3">
        <Tile label="All orders" value={num(d.total)} sub={!d.past ? `so far · ${num(d.planned_total)} expected today` : undefined} href={`/orders?date=${d.date}&back=${back}`} />
        <Tile label="COD orders" value={num(d.cod)} sub={d.total ? `${pct(d.cod / d.total, 0)} of orders` : undefined} href={`/orders?date=${d.date}&view=cod&back=${back}`} />
        <Tile label="Eligible for a campaign" tone="blue" value={num(d.eligible)} sub="Repeat customers paying COD" href={`/orders?date=${d.date}&view=eligible&back=${back}`} />
        <Tile label="Prepaid share" value={pct(prepaidShare, 0)} sub={`${num(d.prepaid)} paid online at checkout`} href={`/orders?date=${d.date}&view=prepaid&back=${back}`} />
        <Tile
          label="Paid online after a message"
          tone="green"
          value={num(d.paid_after_msg)}
          sub={d.messaged ? `of ${num(d.messaged)} messaged` : 'No messages yet'}
          href={`/orders?date=${d.date}&view=paid&back=${back}`}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="card col-span-5 px-5 py-4">
          <div className="label">COD cost at stake</div>
          <div className="metric mt-1.5">{inr(atStake.total)}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            If these <b className="text-ink">{num(atStake.orders)}</b> {d.ready > 0 ? 'COD orders not yet in a campaign' : 'eligible COD orders'} stay cash on
            delivery, they cost you about <b className="text-ink">{inr(atStake.total)}</b> more than if they were paid online.
          </p>
          <div className="mt-3 space-y-2 rounded-lg bg-panel px-3.5 py-3 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">
                Cash handling · {num(atStake.orders)} orders × {inr(cost.cod_fee)}
              </span>
              <span className="font-medium tabular-nums">{inr(atStake.cash)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">
                Extra returns · COD gets returned {pct(cost.cod_rto_rate)} of the time vs {pct(cost.prepaid_rto_rate)} prepaid, × {inr(cost.rto_cost)} per return
              </span>
              <span className="font-medium tabular-nums">{inr(atStake.returns)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Return rates come from your delivered orders in the last 30 days.</p>
        </div>

        <div className="card col-span-7 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2>Campaign</h2>
            {d.campaigns.length > 0 && (
              <Link href="/campaigns" className="link text-[12.5px]">
                All campaigns →
              </Link>
            )}
          </div>
          <div className="mt-3 space-y-3">
            {active.map((c) => (
              <div key={c.id} className="rounded-lg border border-rzp/25 bg-white px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-[12.5px]">
                  <span className="font-medium">{campaignName(c.created_at)}</span>
                  <Link href={`/campaigns/${c.id}`} className="link">
                    Open →
                  </Link>
                </div>
                <CampaignProgress runId={c.id} initial={{ status: c.status, progress: c.progress, eta_seconds: c.eta_seconds }} />
              </div>
            ))}
            {review.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-[#6B4BD8]/25 bg-[#F6F3FF] px-4 py-3">
                <div>
                  <div className="font-medium">
                    {campaignName(c.created_at)} is ready {c.replay && <Badge tone="amber">Replay</Badge>}
                  </div>
                  <div className="text-[12px] text-ink-soft">{num(c.order_count)} orders · the AI has picked an action and drafted a message for each</div>
                </div>
                <Link href={`/campaigns/${c.id}`} className="btn btn-primary">
                  Review &amp; send →
                </Link>
              </div>
            ))}
            {sent.map((c) => (
              <CampaignSummary key={c.id} c={c} back={back} />
            ))}
            {d.ready > 0 && !busy && (
              <div className="rounded-lg border border-rzp/25 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {num(d.ready)} orders {d.past ? 'can be replayed' : 'are ready for a campaign'}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-soft">
                      {d.past
                        ? `This day has passed. A campaign replays it as if the messages went out at 9 PM on ${dayLabel(d.date)}; results up to today appear right after you send.`
                        : 'The AI scores each order, picks no message, a reminder or a ₹50 off offer, and drafts the message. Nothing is sent until you approve.'}
                    </div>
                  </div>
                  <RunCampaignButton
                    date={d.date}
                    ready={d.ready}
                    past={d.past}
                    defaults={{ holdout_pct: cost.holdout_pct, exploration_pct: cost.exploration_pct }}
                  />
                </div>
              </div>
            )}
            {d.ready === 0 && d.campaigns.length === 0 && (
              <p className="text-[13px] text-ink-faint">
                {d.past ? 'No eligible orders on this day.' : 'No eligible orders waiting right now. Click Refresh above to pull new orders.'}
              </p>
            )}
            {!d.past && (
              <p className="text-[11.5px] text-ink-faint">Orders keep arriving through the day. Click Refresh at the top of this page to pull the latest ones.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
