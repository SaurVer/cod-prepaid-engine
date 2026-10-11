import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProfitBreakdown, decisionSentence } from '@/components/profit-breakdown';
import { ACTION_TONE, Badge, GROUP_TONE, PageHeader, Tile } from '@/components/ui';
import { ACTION_LABEL, GROUP_LABEL, campaignName, dayLabel, inr, num, orderCode, pct } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { runModelOutputs } from '@/lib/server/model.ts';

export const dynamic = 'force-dynamic';

const p1 = (x: unknown) => (x == null ? '—' : pct(Number(x)));
const CHOICES = [
  ['none', 'Send nothing'],
  ['nudge', 'Reminder'],
  ['discount', '₹50 offer'],
] as const;

export default async function RunOutputsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const runId = Number(id);
  const db = getDb();
  const out = await runModelOutputs(db, runId, { page: Number(sp.page ?? 1), group: sp.group, action: sp.action });
  if (!out) notFound();
  const { run, rows, agg, total, page, pageSize } = out;
  const day: string = run.source_batch_ids?.[0] ?? '';
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const exampleId = Number(sp.order ?? rows[0]?.order_id ?? 0);
  const [ex] = exampleId
    ? await db.query(
        `select d.order_id, d.detail, d.chosen_action, d.reason_code, ro.assignment_group from decisions d
         join run_orders ro on ro.run_id = d.run_id and ro.order_id = d.order_id where d.run_id = $1 and d.order_id = $2`,
        [runId, exampleId],
      )
    : [];
  const econ = ex?.detail?.econ
    ? { margin: Number(ex.detail.econ.margin), codFee: Number(ex.detail.econ.codFee), rtoCost: Number(ex.detail.econ.rtoCost), discountAmount: Number(ex.detail.econ.discountAmount) }
    : null;
  const qs = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ group: sp.group, action: sp.action, page: sp.page, order: sp.order, ...p })) if (v) s.set(k, v);
    const str = s.toString();
    return `/model/runs/${runId}${str ? `?${str}` : ''}`;
  };
  const here = qs({});
  const chip = (active: boolean) => `rounded-md px-2.5 py-1 text-[12px] ${active ? 'bg-white font-medium text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`;
  const aiTotal = (agg.ai_none ?? 0) + (agg.ai_nudge ?? 0) + (agg.ai_discount ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: '/model', label: 'Model' }}
        title={`Predictions · ${campaignName(run.created_at)}`}
        sub={`${num(agg.n)} orders from ${dayLabel(day)}, scored by model version ${run.model_version}. For each order the AI estimated what would happen under each choice, worked out the expected profit, and picked the best.`}
        actions={
          <Link href={`/campaigns/${runId}`} className="btn">
            Open campaign
          </Link>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <Tile label="Orders scored" value={num(agg.n)} sub={`${num(aiTotal)} decided by the AI · ${num((agg.control ?? 0) + (agg.random_test ?? 0))} set aside at random`} />
        {CHOICES.map(([a, l]) => (
          <div key={a} className="card min-h-[104px] px-4 py-3.5">
            <div className="label">{a === 'none' ? 'If we send nothing' : a === 'nudge' ? 'If we send a reminder' : 'If we send the offer'}</div>
            <div className="metric mt-1.5">{p1(agg[`p_${a}`])}</div>
            <div className="mt-1 text-[12px] text-ink-faint">
              would pay online, on average · {inr(agg[`ev_${a}`], 2)} profit per order · AI chose “{l.toLowerCase()}” for {num(agg[`ai_${a}`])}
            </div>
          </div>
        ))}
      </div>

      {ex?.detail?.breakdown && econ && (
        <div className="card px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2>
              One order, worked through · {orderCode(ex.order_id)} <Badge tone={GROUP_TONE[ex.assignment_group]}>{GROUP_LABEL[ex.assignment_group]}</Badge>
            </h2>
            <Link href={`/inspector?run=${runId}&order=${ex.order_id}&back=${encodeURIComponent(here)}`} className="link text-[12px]">
              Everything about this order →
            </Link>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-soft">{decisionSentence(ex.detail.breakdown, ex.chosen_action, ex.reason_code)}</p>
          <p className="mb-3 mt-1 text-[12px] text-ink-faint">Click any order code in the table to work it through here.</p>
          <ProfitBreakdown breakdown={ex.detail.breakdown} econ={econ} chosen={ex.chosen_action} />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
          <h2>Every order in this campaign</h2>
          <div className="flex rounded-lg border border-line bg-panel p-0.5">
            {[
              ['', 'All'],
              ['model', 'AI-decided'],
              ['holdout', 'Control group'],
              ['explore', 'Random test'],
            ].map(([k, l]) => (
              <Link key={k} href={qs({ group: k || undefined, page: undefined, order: undefined })} className={chip((sp.group ?? '') === k)}>
                {l}
              </Link>
            ))}
          </div>
          <div className="flex rounded-lg border border-line bg-panel p-0.5">
            {[['', 'Any choice'], ...Object.entries(ACTION_LABEL)].map(([k, l]) => (
              <Link key={k} href={qs({ action: k || undefined, page: undefined, order: undefined })} className={chip((sp.action ?? '') === k)}>
                {l}
              </Link>
            ))}
          </div>
          <span className="ml-auto text-[12px] text-ink-faint">{num(total)} orders · biggest expected gain first</span>
        </div>
        <div className="overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th rowSpan={2}>Order</th>
                <th rowSpan={2}>Group</th>
                <th colSpan={3} className="border-l border-line text-center normal-case">
                  Chance the customer pays online
                </th>
                <th colSpan={3} className="border-l border-line text-center normal-case">
                  Chance the customer cancels
                </th>
                <th colSpan={2} className="border-l border-line text-center normal-case">
                  Chance the order is returned
                </th>
                <th colSpan={3} className="border-l border-line text-center normal-case">
                  Expected profit per order
                </th>
                <th rowSpan={2} className="border-l border-line">
                  AI&apos;s choice
                </th>
                <th rowSpan={2}>What happened</th>
              </tr>
              <tr>
                {[
                  'Send nothing',
                  'Reminder',
                  '₹50 offer',
                  'Send nothing',
                  'Reminder',
                  '₹50 offer',
                  'If paid cash',
                  'If paid online',
                  'Send nothing',
                  'Reminder',
                  '₹50 offer',
                ].map((h, i) => (
                  <th key={i} className={`text-right normal-case ${i === 0 || i === 3 || i === 6 || i === 8 ? 'border-l border-line' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const best = Math.max(Number(r.ev_none), Number(r.ev_nudge), Number(r.ev_discount));
                const evCls = (v: unknown) => `text-right ${Number(v) === best ? 'font-semibold text-ok' : ''}`;
                const sel = Number(r.order_id) === exampleId;
                return (
                  <tr key={r.order_id} className={sel ? '[&>td]:bg-rzp-soft' : ''}>
                    <td>
                      <Link href={qs({ order: String(r.order_id) })} className="link font-mono text-[12px]" scroll={false}>
                        {orderCode(r.order_id)}
                      </Link>
                    </td>
                    <td>
                      <Badge tone={GROUP_TONE[r.assignment_group]}>{GROUP_LABEL[r.assignment_group]}</Badge>
                    </td>
                    <td className="border-l border-line text-right">{p1(r.p_convert_none)}</td>
                    <td className="text-right">{p1(r.p_convert_nudge)}</td>
                    <td className="text-right">{p1(r.p_convert_discount)}</td>
                    <td className="border-l border-line text-right">{p1(r.p_cancel_none)}</td>
                    <td className="text-right">{p1(r.p_cancel_nudge)}</td>
                    <td className="text-right">{p1(r.p_cancel_discount)}</td>
                    <td className="border-l border-line text-right">{p1(r.r_cod_none)}</td>
                    <td className="text-right">{p1(r.r_pre_none)}</td>
                    <td className={`border-l border-line ${evCls(r.ev_none)}`}>{inr(Number(r.ev_none), 2)}</td>
                    <td className={evCls(r.ev_nudge)}>{inr(Number(r.ev_nudge), 2)}</td>
                    <td className={evCls(r.ev_discount)}>{inr(Number(r.ev_discount), 2)}</td>
                    <td className="border-l border-line">
                      <Badge tone={ACTION_TONE[r.chosen_action]}>{ACTION_LABEL[r.chosen_action]}</Badge>
                    </td>
                    <td className="text-ink-soft">
                      {r.final_outcome == null
                        ? r.paid_online
                          ? 'Paid online'
                          : 'Waiting'
                        : `${r.paid_online ? 'Paid online · ' : ''}${r.final_outcome === 'rto' ? 'Returned' : r.final_outcome === 'cancelled' ? 'Cancelled' : 'Delivered'}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px] text-ink-soft">
          <span>
            Green = the most profitable choice for that order. Control and random-test orders got what the random draw gave them. Page {page} of {pages}.
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link className="btn btn-sm" href={qs({ page: String(page - 1), order: undefined })}>
                ← Previous
              </Link>
            )}
            {page < pages && (
              <Link className="btn btn-sm" href={qs({ page: String(page + 1), order: undefined })}>
                Next →
              </Link>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
