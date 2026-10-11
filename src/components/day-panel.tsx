import Link from 'next/link';
import { CampaignProgress, ReviewLink, RunCampaignButton } from '@/components/campaign-actions';
import { Badge, Tile } from '@/components/ui';
import { campaignName, dayLabel, inr, num, pct } from '@/lib/format';
import { campaignHref } from '@/lib/server/pipeline.ts';
import type { DaySummary, codCost } from '@/lib/server/results.ts';

export function DayPanel({ d, today, cost, back }: { d: DaySummary; today: string; cost: Awaited<ReturnType<typeof codCost>>; back: string }) {
  const b = encodeURIComponent(back);
  const prepaidShare = d.total ? d.prepaid / d.total : 0;
  const active = d.campaigns.filter((c) => !['sent', 'closed'].includes(c.status));
  const sent = d.campaigns.filter((c) => c.status === 'sent');
  return (
    <div className="space-y-4 px-5 pb-5 pt-1">
      <div className="grid grid-cols-5 gap-3">
        <Tile label="All orders" value={num(d.total)} sub={d.date === today ? `so far · ${num(d.planned_total)} expected today` : undefined} href={`/orders?date=${d.date}&back=${b}`} />
        <Tile label="COD orders" value={num(d.cod)} sub={d.total ? `${pct(d.cod / d.total, 0)} of orders` : undefined} href={`/orders?date=${d.date}&view=cod&back=${b}`} />
        <Tile
          label="Eligible for a campaign"
          tone="blue"
          value={num(d.eligible)}
          sub="Repeat customers paying COD"
          href={`/orders?date=${d.date}&view=eligible&back=${b}`}
        />
        <Tile label="Prepaid share" value={pct(prepaidShare, 0)} sub={`${num(d.prepaid)} paid online at checkout`} href={`/orders?date=${d.date}&view=prepaid&back=${b}`} />
        <Tile label="Paid online after a message" tone="green" value={num(d.paid_after_msg)} sub={d.messaged ? `of ${num(d.messaged)} messaged` : 'No messages yet'} href={`/orders?date=${d.date}&view=paid&back=${b}`} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="card col-span-5 px-5 py-4">
          <div className="label">COD cost at stake</div>
          <div className="metric mt-1.5">{inr(cost.total)}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            If these <b className="text-ink">{num(cost.eligible)}</b> {d.ready > 0 ? 'waiting' : 'eligible'} COD orders stay cash on delivery, they cost you about{' '}
            <b className="text-ink">{inr(cost.total)}</b> more than if they were paid online.
          </p>
          <div className="mt-3 space-y-2 rounded-lg bg-panel px-3.5 py-3 text-[12.5px]">
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">
                Cash handling · {num(cost.eligible)} orders × {inr(cost.cod_fee)}
              </span>
              <span className="font-medium tabular-nums">{inr(cost.cash)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">
                Extra returns · COD gets returned {pct(cost.cod_rto_rate)} of the time vs {pct(cost.prepaid_rto_rate)} prepaid, × {inr(cost.rto_cost)} per return
              </span>
              <span className="font-medium tabular-nums">{inr(cost.returns)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Return rates come from your delivered orders in the last 30 days.</p>
        </div>

        <div className="card col-span-7 px-5 py-4">
          <div className="flex items-center justify-between">
            <h2>Campaign</h2>
            <Link href={`/day/${d.date}`} className="link text-[12.5px]">
              See more about {dayLabel(d.date)} →
            </Link>
          </div>
          <div className="mt-3 space-y-4">
            {active.map((c) =>
              c.status === 'ready_for_review' ? (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-[#6B4BD8]/25 bg-[#F6F3FF] px-4 py-3">
                  <div>
                    <div className="font-medium">{campaignName(c.created_at)} is ready</div>
                    <div className="text-[12px] text-ink-soft">{num(c.order_count)} orders · the AI has picked an action and drafted a message for each</div>
                  </div>
                  <ReviewLink href={campaignHref(d.date, c.id)} />
                </div>
              ) : (
                <CampaignProgress key={c.id} runId={c.id} initial={{ status: c.status, progress: c.progress, eta_seconds: c.eta_seconds }} />
              ),
            )}
            {sent.map((c) => (
              <div key={c.id} className="rounded-lg border border-line px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {campaignName(c.created_at)} <Badge tone="green">Sent</Badge>
                  </div>
                  <Link href={campaignHref(d.date, c.id)} className="link text-[12.5px]">
                    View results →
                  </Link>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-3 text-[12px]">
                  {[
                    ['Messages sent', num(c.sent)],
                    ['Opened', num(c.opened)],
                    ['Clicked', num(c.clicked)],
                    ['Paid online', num(c.paid_online)],
                    [
                      'Extra profit vs control',
                      c.extra_total == null ? `Measuring · ${pct(c.resolved_share, 0)}` : inr(c.extra_total),
                    ],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div className="text-ink-faint">{l}</div>
                      <div className="metric-sm mt-0.5">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {d.ready > 0 && active.length === 0 && (
              <div className="flex items-center justify-between rounded-lg border border-rzp/25 bg-rzp-faint px-4 py-3">
                <div>
                  <div className="font-medium">{num(d.ready)} orders are ready for a campaign</div>
                  <div className="text-[12px] text-ink-soft">
                    The AI scores each order, picks no message, a reminder or a ₹50 off offer, and drafts the message. Nothing is sent until you approve.
                  </div>
                </div>
                <RunCampaignButton date={d.date} ready={d.ready} />
              </div>
            )}
            {d.ready === 0 && d.campaigns.length === 0 && (
              <p className="text-[13px] text-ink-faint">
                {d.date === today ? 'No eligible orders waiting right now. Click Refresh to pull new orders.' : 'No campaign ran on this day and its orders have been dispatched.'}
              </p>
            )}
            {d.date === today && (
              <p className="text-[11.5px] text-ink-faint">Orders keep arriving through the day. Click Refresh in the top bar to pull the latest ones.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
