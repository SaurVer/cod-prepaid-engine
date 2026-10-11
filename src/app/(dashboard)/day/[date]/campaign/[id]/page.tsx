import { notFound } from 'next/navigation';
import { CampaignProgress } from '@/components/campaign-actions';
import { ApproveSend, CampaignGrid } from '@/components/campaign-grid';
import { CompareBars } from '@/components/charts';
import { AutoRefresh, TrackResponses } from '@/components/live';
import { ACTION_LONG, campaignName, dayLabel, inr, num, pct, STATUS_LABEL } from '@/lib/format';
import { campaignDecisions } from '@/lib/server/campaign.ts';
import { getDb } from '@/lib/server/db.ts';
import { messageRows } from '@/lib/server/messages.ts';
import { runResults } from '@/lib/server/results.ts';
import { Badge, PageHeader, Tile } from '@/components/ui';

export const dynamic = 'force-dynamic';

const WHY: Record<string, string> = {
  none: 'For these orders, any message is expected to cost more than it earns.',
  nudge: 'A plain reminder is expected to earn the most. The discount would mostly go to people who pay online anyway.',
  discount: 'Only a ₹50 off offer is expected to move these customers, and it still pays for itself.',
};

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { date, id } = await params;
  const sp = await searchParams;
  const runId = Number(id);
  const db = getDb();
  const res = await runResults(db, runId);
  if (!res || res.run.is_pilot) notFound();
  const run = res.run;
  const active = ['queued', 'scoring', 'deciding', 'drafting'].includes(run.status);
  const name = campaignName(run.created_at);
  const day = run.source_batch_ids?.[0] ?? date;
  const dec = active ? null : await campaignDecisions(db, runId);
  const rows = active ? [] : await messageRows(db, runId);
  const card = (a: string) => dec?.cards.find((c) => c.action === a) ?? { n: 0, gain: 0 };
  const sample = (a: string) => dec?.samples.find((s) => s.action === a);
  const holdout = dec?.groups.filter((g) => g.g === 'holdout').reduce((s, g) => s + g.n, 0) ?? 0;
  const explore = dec?.groups.filter((g) => g.g === 'explore') ?? [];
  const sent = run.status === 'sent';
  const f = res.funnel;
  const m = res.groups.model;
  const h = res.groups.holdout;
  const trackUntil = sent && f.sent_at ? new Date(Date.parse(f.sent_at) + 4 * 60_000).toISOString() : null;

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        back={{ href: `/?date=${day}`, label: `Back to ${dayLabel(day)}` }}
        title={
          <span className="flex items-center gap-3">
            {name}
            <Badge tone={sent ? 'green' : run.status === 'ready_for_review' ? 'violet' : 'blue'}>{STATUS_LABEL[run.status]}</Badge>
          </span>
        }
        sub={`${num(run.order_count)} orders from ${dayLabel(day)} · AI model v${run.model_version} · started by the ${run.created_by_role}`}
        actions={
          <>
            <TrackResponses untilIso={trackUntil} />
            {run.status === 'ready_for_review' && <ApproveSend runId={runId} name={name} />}
          </>
        }
      />

      {active && (
        <div className="card card-pad">
          <CampaignProgress runId={runId} initial={{ status: run.status, progress: Number(run.progress), eta_seconds: run.eta_seconds }} />
        </div>
      )}

      {run.status === 'ready_for_review' && (
        <div className="rounded-xl border border-rzp/25 bg-rzp-faint px-5 py-3.5 text-[13px] text-ink-soft">
          <b className="text-ink">Review, then send.</b> The AI has chosen an action for every order and written the messages. Click any message to edit it.
          When you&apos;re happy, click <b className="text-ink">Approve &amp; send</b>. You&apos;ll see a summary before anything goes out.
        </div>
      )}

      {sent && (
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-3">
            <Tile label="Messages sent" value={num(f.sent)} />
            <Tile label="Delivered" value={num(f.delivered)} sub={f.sent ? pct(f.delivered / f.sent, 0) : undefined} />
            <Tile label="Opened" value={num(f.opened)} sub={f.delivered ? `${pct(f.opened / f.delivered, 0)} of delivered` : undefined} />
            <Tile label="Clicked link" value={num(f.clicked)} sub={`Click rate ${pct(f.ctr)}`} />
            <Tile label="Paid online" tone="blue" value={num(f.converted)} sub={f.sent ? `${pct(f.converted / f.sent)} of messaged` : undefined} />
            <Tile
              label="Extra profit vs control"
              tone={res.realised_gain == null ? 'muted' : 'green'}
              value={res.realised_gain == null ? 'Measuring' : inr(res.realised_gain)}
              sub={
                res.realised_gain == null
                  ? `${pct(res.resolved_share, 0)} of deliveries known · expected ${inr(res.estimated_gain_model)}`
                  : `${inr(res.incremental_per_order, 2)} per order · expected ${inr(res.estimated_gain_model)}`
              }
            />
          </div>
          <div className="grid grid-cols-12 gap-4">
            <div className="card col-span-7 px-4 pb-2 pt-3.5">
              <div className="flex items-center justify-between">
                <h2>AI-picked orders vs control group</h2>
                <span className="text-[12px] text-ink-faint">
                  {num(m.n)} AI-picked · {num(h.n)} control
                </span>
              </div>
              <CompareBars
                data={[
                  { metric: 'Paid online', ai: m.conversion_rate, control: h.conversion_rate },
                  { metric: 'Cancelled', ai: m.cancel_rate, control: h.cancel_rate },
                  { metric: 'Returned (RTO)', ai: m.rto_rate, control: h.rto_rate },
                ]}
              />
            </div>
            <div className="card col-span-5 px-5 py-4 text-[13px]">
              <h2>How the extra profit is measured</h2>
              <p className="mt-2 leading-relaxed text-ink-soft">
                Before sending, {pct(Number(run.settings_snapshot?.holdout_pct ?? 0.1), 0)} of orders were picked at random as a <b className="text-ink">control group</b> and got no message.
                Comparing profit per order between the AI-picked orders and the control group shows what the campaign really added, after discounts, message costs,
                cancellations and returns.
              </p>
              <table className="mt-3 w-full text-[12.5px]">
                <tbody>
                  {[
                    ['Profit per resolved order · AI-picked', inr(m.realised_per_order, 2)],
                    ['Profit per resolved order · control', inr(h.realised_per_order, 2)],
                    ['Deliveries known', `${num(m.resolved + h.resolved)} of ${num(m.n + h.n)}`],
                  ].map(([l, v]) => (
                    <tr key={l} className="border-t border-line">
                      <td className="py-1.5 text-ink-soft">{l}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11.5px] text-ink-faint">Delivery outcomes arrive 3–5 days after dispatch, so a new campaign shows “Measuring” until then.</p>
            </div>
          </div>
        </div>
      )}

      {dec && (
        <>
          <div>
            <h2 className="mb-2">What the AI decided</h2>
            <div className="grid grid-cols-3 gap-4">
              {(['none', 'nudge', 'discount'] as const).map((a) => {
                const c = card(a);
                const s = sample(a);
                return (
                  <div key={a} className="card flex flex-col">
                    <div className="px-5 pt-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[15px]">{ACTION_LONG[a]}</h3>
                        <a href={`?action=${a}#orders`} className="text-[12px] font-medium text-rzp hover:underline">
                          View orders
                        </a>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">{WHY[a]}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 px-5 py-3">
                      <div>
                        <div className="label">Orders</div>
                        <div className="metric">{num(c.n)}</div>
                      </div>
                      <div>
                        <div className="label">Expected extra profit</div>
                        <div className="metric text-ok">{inr(Number(c.gain))}</div>
                      </div>
                    </div>
                    <div className="mx-5 mb-4 flex-1 rounded-lg bg-panel px-3.5 py-3 text-[12.5px]">
                      {a === 'none' ? (
                        <span className="text-ink-faint">No message is sent for these orders.</span>
                      ) : s ? (
                        <>
                          <div className="label mb-1">Sample message{s.fallback_used ? ' · template' : ' · written by AI'}</div>
                          <div className="text-ink">“{s.final_text}”</div>
                        </>
                      ) : (
                        <span className="text-ink-faint">No orders.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="card px-5 py-4">
              <div className="flex items-baseline justify-between">
                <h3>Control group · {num(holdout)} orders</h3>
                <a href="?group=holdout#orders" className="text-[12px] font-medium text-rzp hover:underline">
                  View
                </a>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-faint">Picked at random and sent nothing, so we can measure what the campaign really added.</p>
            </div>
            <div className="card px-5 py-4">
              <div className="flex items-baseline justify-between">
                <h3>Random test · {num(explore.reduce((s, g) => s + g.n, 0))} orders</h3>
                <a href="?group=explore#orders" className="text-[12px] font-medium text-rzp hover:underline">
                  View
                </a>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-faint">
                Sent a reminder ({num(explore.find((g) => g.action === 'nudge')?.n ?? 0)}) or an offer ({num(explore.find((g) => g.action === 'discount')?.n ?? 0)}) at random, so the
                model keeps learning.
              </p>
            </div>
          </div>
          <div id="orders">
            <CampaignGrid runId={runId} editable={run.status === 'ready_for_review'} rows={rows} initialAction={sp.action} initialGroup={sp.group} key={`${sp.action}-${sp.group}`} />
          </div>
          {dec.fallbacks && Number(dec.fallbacks.fallback) > 0 && (
            <p className="text-[12px] text-ink-faint">
              {num(dec.fallbacks.fallback)} of {num(dec.fallbacks.total)} messages use the fixed template
              {Number(dec.fallbacks.fallback) === Number(dec.fallbacks.total) ? ' (historical campaign, no live AI call)' : ' because the AI draft did not pass the checks'}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
