import Link from 'next/link';
import { DayPanel } from '@/components/day-panel';
import { DailyChart } from '@/components/charts';
import { AutoRefresh } from '@/components/live';
import { Badge, PageHeader, Tile } from '@/components/ui';
import { dayLabel, inr, num, pct, todayIST, weekday } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { type DaySummary, codCost, daySummaries } from '@/lib/server/results.ts';

export const dynamic = 'force-dynamic';

type Status = 'live' | 'sent' | 'running' | 'review' | 'needs' | 'none';

function dayStatus(d: DaySummary, today: string): Status {
  const c = d.campaigns;
  if (c.some((x) => ['queued', 'scoring', 'deciding', 'drafting'].includes(x.status))) return 'running';
  if (c.some((x) => x.status === 'ready_for_review')) return 'review';
  if (c.some((x) => x.status === 'sent')) return 'sent';
  if (d.ready > 0) return 'needs';
  return d.date === today ? 'live' : 'none';
}

const STATUS_BADGE: Record<Status, { label: string; tone: 'green' | 'blue' | 'amber' | 'gray' | 'violet' }> = {
  live: { label: 'Orders arriving', tone: 'blue' },
  sent: { label: 'Campaign sent', tone: 'green' },
  running: { label: 'Campaign running', tone: 'blue' },
  review: { label: 'Ready to review', tone: 'violet' },
  needs: { label: 'Needs a campaign', tone: 'amber' },
  none: { label: 'No campaign', tone: 'gray' },
};

function extraProfit(d: DaySummary): { value: number | null; resolved: number } {
  const sent = d.campaigns.filter((c) => c.status === 'sent');
  if (!sent.length) return { value: null, resolved: 0 };
  const resolved = sent.reduce((a, c) => a + c.resolved_share, 0) / sent.length;
  if (sent.some((c) => c.extra_total == null)) return { value: null, resolved };
  return { value: sent.reduce((a, c) => a + (c.extra_total ?? 0), 0), resolved };
}

function qs(p: Record<string, string | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `/?${str}` : '/';
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const all = await daySummaries(db, 30);
  const today = todayIST();
  const range = ['7', '14', '30'].includes(sp.range ?? '') ? Number(sp.range) : 14;
  const show = sp.show ?? 'all';
  const inRange = all.slice(0, range);
  const days = inRange.filter((d) => {
    const s = dayStatus(d, today);
    if (show === 'sent') return s === 'sent';
    if (show === 'needs') return s === 'needs' || s === 'review' || s === 'live';
    return true;
  });
  const selected = sp.date === 'none' ? null : (days.find((d) => d.date === sp.date) ?? days[0] ?? null);
  const cost = selected ? await codCost(db, selected.ready > 0 ? selected.ready : selected.eligible) : null;

  const glance = {
    cod: inRange.reduce((a, d) => a + d.cod, 0),
    messaged: inRange.reduce((a, d) => a + d.messaged, 0),
    paid: inRange.reduce((a, d) => a + d.paid_after_msg, 0),
    extra: inRange.reduce((a, d) => a + (extraProfit(d).value ?? 0), 0),
    measuredDays: inRange.filter((d) => extraProfit(d).value != null).length,
  };
  const link = (p: Record<string, string | undefined>) => qs({ range: String(range), show, date: selected?.date, ...p });

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        title="Overview"
        sub="Your COD orders, day by day. Pick a day to see what happened and run a campaign on it."
      />

      {/* Filters + date pills */}
      <div className="card px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="label">Range</span>
            <div className="flex rounded-lg border border-line bg-panel p-0.5">
              {[7, 14, 30].map((r) => (
                <Link
                  key={r}
                  href={link({ range: String(r), date: undefined })}
                  className={`rounded-md px-3 py-1 text-[12.5px] ${range === r ? 'bg-white font-medium text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
                >
                  {r} days
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="label">Show</span>
            <div className="flex rounded-lg border border-line bg-panel p-0.5">
              {[
                ['all', 'All days'],
                ['sent', 'Campaign sent'],
                ['needs', 'Needs a campaign'],
              ].map(([k, l]) => (
                <Link
                  key={k}
                  href={link({ show: k, date: undefined })}
                  className={`rounded-md px-3 py-1 text-[12.5px] ${show === k ? 'bg-white font-medium text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
                >
                  {l}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => {
            const s = dayStatus(d, today);
            const active = selected?.date === d.date;
            const dot = { live: 'bg-rzp', sent: 'bg-ok', running: 'bg-rzp', review: 'bg-[#6B4BD8]', needs: 'bg-warn', none: 'bg-ink-faint/40' }[s];
            return (
              <Link
                key={d.date}
                href={link({ date: d.date })}
                className={`flex min-w-[76px] shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-center transition-colors ${
                  active ? 'border-rzp bg-rzp text-white shadow-pop' : 'border-line bg-white hover:border-rzp/40'
                }`}
              >
                <span className={`text-[11px] ${active ? 'text-white/75' : 'text-ink-faint'}`}>{d.date === today ? 'Today' : weekday(d.date)}</span>
                <span className="text-[14px] font-semibold">{dayLabel(d.date)}</span>
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : dot}`} />
              </Link>
            );
          })}
          {days.length === 0 && <div className="py-2 text-[13px] text-ink-faint">No days match this filter.</div>}
        </div>
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 grid grid-cols-2 gap-4">
          <Tile label={`COD orders · ${range} days`} value={num(glance.cod)} href={`/orders?view=cod&back=${encodeURIComponent(link({}))}`} />
          <Tile label="Orders messaged" value={num(glance.messaged)} href={`/orders?view=messaged&back=${encodeURIComponent(link({}))}`} />
          <Tile label="Paid online after a message" tone="blue" value={num(glance.paid)} href={`/orders?view=paid&back=${encodeURIComponent(link({}))}`} />
          <Tile
            label="Extra profit vs control"
            tone="green"
            value={inr(glance.extra)}
            sub={`${glance.measuredDays} days fully measured`}
          />
        </div>
        <div className="card col-span-8 px-4 pb-2 pt-3.5">
          <div className="mb-1 flex items-center justify-between">
            <h2>Orders per day</h2>
            <span className="text-[12px] text-ink-faint">Last {range} days</span>
          </div>
          <DailyChart data={inRange.slice().reverse().map((d) => ({ date: d.date, cod: d.cod, prepaid: d.prepaid, paid: d.paid_after_msg }))} />
        </div>
      </div>

      {/* Day list */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[150px_1fr_1fr_1fr_170px_1fr_1fr_24px] items-center gap-3 border-b border-line bg-panel px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] text-ink-faint">
          <span>Day</span>
          <span className="text-right">Orders</span>
          <span className="text-right">COD</span>
          <span className="text-right">Eligible</span>
          <span>Campaign</span>
          <span className="text-right">Paid online after msg</span>
          <span className="text-right">Extra profit vs control</span>
          <span />
        </div>
        {days.map((d) => {
          const s = dayStatus(d, today);
          const open = selected?.date === d.date;
          const ep = extraProfit(d);
          return (
            <div key={d.date} className={`border-b border-line last:border-0 ${open ? 'bg-rzp-faint/60' : ''}`}>
              <Link
                href={link({ date: open ? 'none' : d.date })}
                className="grid grid-cols-[150px_1fr_1fr_1fr_170px_1fr_1fr_24px] items-center gap-3 px-5 py-3 text-[13px] hover:bg-rzp-faint"
              >
                <span>
                  <span className="font-semibold">{d.date === today ? 'Today' : weekday(d.date)}</span>
                  <span className="ml-1.5 text-ink-soft">{dayLabel(d.date)}</span>
                </span>
                <span className="text-right tabular-nums">{num(d.total)}</span>
                <span className="text-right tabular-nums">{num(d.cod)}</span>
                <span className="text-right tabular-nums">{num(d.eligible)}</span>
                <span>
                  <Badge tone={STATUS_BADGE[s].tone}>{STATUS_BADGE[s].label}</Badge>
                </span>
                <span className="text-right tabular-nums">{d.paid_after_msg ? num(d.paid_after_msg) : '—'}</span>
                <span className="text-right tabular-nums">
                  {ep.value != null ? (
                    <span className={ep.value >= 0 ? 'font-medium text-ok' : 'font-medium text-bad'}>{inr(ep.value)}</span>
                  ) : d.campaigns.some((c) => c.status === 'sent') ? (
                    <span className="text-ink-faint">Measuring · {pct(ep.resolved, 0)}</span>
                  ) : (
                    '—'
                  )}
                </span>
                <span className={`text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
              </Link>
              {open && cost && <DayPanel d={d} today={today} cost={cost} back={link({})} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

