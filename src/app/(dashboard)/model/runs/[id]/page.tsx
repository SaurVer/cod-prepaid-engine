import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACTION_TONE, Badge, GROUP_TONE, PageHeader, Tile } from '@/components/ui';
import { OUTCOME_LABELS } from '@/lib/core/decide.ts';
import { ACTION_LABEL, GROUP_LABEL, campaignName, dayLabel, inr, num, orderCode, pct } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { runModelOutputs } from '@/lib/server/model.ts';

export const dynamic = 'force-dynamic';

const p3 = (x: unknown) => (x == null ? '—' : Number(x).toFixed(3));

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
  const snap = run.settings_snapshot ?? {};
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const exampleId = Number(sp.order ?? rows[0]?.order_id ?? 0);
  const [ex] = exampleId
    ? await db.query(
        `select d.order_id, d.detail, d.chosen_action, d.reason_code, ro.assignment_group from decisions d
         join run_orders ro on ro.run_id = d.run_id and ro.order_id = d.order_id where d.run_id = $1 and d.order_id = $2`,
        [runId, exampleId],
      )
    : [];
  const qs = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ group: sp.group, action: sp.action, page: sp.page, order: sp.order, ...p })) if (v) s.set(k, v);
    const str = s.toString();
    return `/model/runs/${runId}${str ? `?${str}` : ''}`;
  };
  const chip = (active: boolean) => `rounded-md px-2.5 py-1 text-[12px] ${active ? 'bg-white font-medium text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`;

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: '/model?tab=runs', label: 'Run outputs' }}
        title={`Model output · ${campaignName(run.created_at)}`}
        sub={`${num(agg.n)} orders from ${dayLabel(day)} scored by model v${run.model_version} · control ${pct(Number(snap.holdout_pct ?? 0), 0)} · random test ${pct(Number(snap.exploration_pct ?? 0), 0)}`}
        actions={
          <Link href={`/campaigns/${runId}`} className="btn">
            Open campaign
          </Link>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <Tile label="AI decisions" value={num((agg.ai_none ?? 0) + (agg.ai_nudge ?? 0) + (agg.ai_discount ?? 0))} sub={`${num(agg.ai_none)} no message · ${num(agg.ai_nudge)} reminder · ${num(agg.ai_discount)} offer`} />
        <Tile label="Set aside at random" value={num((agg.control ?? 0) + (agg.random_test ?? 0))} sub={`${num(agg.control)} control · ${num(agg.random_test)} random test`} />
        <Tile label="Expected extra profit" tone="green" value={inr(agg.expected_gain)} sub="Sum of the chosen action’s gain, AI-decided orders" />
        <Tile label="Average chance of a return if COD" value={pct(agg.rc)} sub={`vs ${pct(agg.rp_nudge)} if paid online`} />
      </div>

      <div className="card overflow-auto">
        <div className="border-b border-line px-4 py-3">
          <h2>Average prediction per action, all orders in this run</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">These averages feed nothing directly; every order is decided on its own numbers (table below).</p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Action</th>
              <th className="text-right">Pays online (P)</th>
              <th className="text-right">Cancels (K)</th>
              <th className="text-right">Returned if COD (Rc)</th>
              <th className="text-right">Returned if prepaid (Rp)</th>
              <th className="text-right">Expected profit per order</th>
            </tr>
          </thead>
          <tbody>
            {(['none', 'nudge', 'discount'] as const).map((a) => (
              <tr key={a}>
                <td>{ACTION_LABEL[a]}</td>
                <td className="text-right">{pct(agg[`p_${a}`])}</td>
                <td className="text-right">{pct(agg[`k_${a}`])}</td>
                <td className="text-right">{pct(agg.rc)}</td>
                <td className="text-right">{a === 'none' ? '—' : pct(agg[`rp_${a}`])}</td>
                <td className="text-right">{inr(agg[`ev_${a}`], 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ex?.detail?.breakdown && (
        <div className="card px-5 py-4">
          <div className="flex items-baseline justify-between">
            <h2>
              Worked example · order {orderCode(ex.order_id)}{' '}
              <Badge tone={GROUP_TONE[ex.assignment_group]}>{GROUP_LABEL[ex.assignment_group]}</Badge>{' '}
              <Badge tone={ACTION_TONE[ex.chosen_action]}>{ACTION_LABEL[ex.chosen_action]}</Badge>
            </h2>
            <a href={`/inspector?run=${runId}&order=${ex.order_id}`} target="_blank" className="link text-[12px]">
              Full order inspector →
            </a>
          </div>
          <p className="mt-1 text-[12px] text-ink-faint">Click any order in the table to show it here. Expected profit = Σ chance × profit of that outcome − message cost.</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(['none', 'nudge', 'discount'] as const).map((a) => {
              const b = ex.detail.breakdown[a];
              return (
                <div key={a} className={`rounded-lg border px-4 py-3 ${ex.chosen_action === a ? 'border-rzp bg-rzp-faint' : 'border-line'}`}>
                  <div className="flex items-center justify-between font-semibold">
                    {ACTION_LABEL[a]}
                    <span className="tabular-nums">{inr(b.ev, 2)}</span>
                  </div>
                  <table className="mt-2 w-full text-[11.5px]">
                    <tbody>
                      {OUTCOME_LABELS.map((l, i) => (
                        <tr key={l} className="border-t border-line">
                          <td className="py-1 text-ink-soft">{l}</td>
                          <td className="py-1 text-right tabular-nums">{pct(b.pi[i])}</td>
                          <td className="py-1 text-right tabular-nums text-ink-faint">× {inr(b.payoff[i])}</td>
                          <td className="py-1 text-right tabular-nums">{inr(b.contribution[i], 2)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-line">
                        <td className="py-1 text-ink-soft" colSpan={3}>
                          Message cost
                        </td>
                        <td className="py-1 text-right tabular-nums">−{inr(b.messageCost, 2)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {a !== 'none' && (
                    <div className="mt-1.5 text-[11.5px] text-ink-soft">
                      Gain vs no message:{' '}
                      <b className={b.ev - ex.detail.breakdown.none.ev > 0 ? 'text-ok' : 'text-bad'}>{inr(b.ev - ex.detail.breakdown.none.ev, 2)}</b>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
          <h2>Every order in this run</h2>
          <div className="flex rounded-lg border border-line bg-panel p-0.5">
            {[
              ['', 'All'],
              ['model', 'AI-decided'],
              ['holdout', 'Control'],
              ['explore', 'Random test'],
            ].map(([k, l]) => (
              <Link key={k} href={qs({ group: k || undefined, page: undefined })} className={chip((sp.group ?? '') === k)}>
                {l}
              </Link>
            ))}
          </div>
          <div className="flex rounded-lg border border-line bg-panel p-0.5">
            {[['', 'Any action'], ...Object.entries(ACTION_LABEL)].map(([k, l]) => (
              <Link key={k} href={qs({ action: k || undefined, page: undefined })} className={chip((sp.action ?? '') === k)}>
                {l}
              </Link>
            ))}
          </div>
          <span className="ml-auto text-[12px] text-ink-faint">
            {num(total)} orders · sorted by best gain
          </span>
        </div>
        <div className="overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th rowSpan={2}>Order</th>
                <th rowSpan={2}>Group</th>
                <th colSpan={3} className="border-l border-line text-center">
                  Pays online (P)
                </th>
                <th colSpan={3} className="border-l border-line text-center">
                  Cancels (K)
                </th>
                <th colSpan={2} className="border-l border-line text-center">
                  Returned
                </th>
                <th colSpan={3} className="border-l border-line text-center">
                  Expected profit
                </th>
                <th rowSpan={2} className="border-l border-line">
                  Decision
                </th>
                <th rowSpan={2}>What happened</th>
              </tr>
              <tr>
                {['None', 'Remind', 'Offer', 'None', 'Remind', 'Offer', 'If COD', 'If prepaid', 'None', 'Remind', 'Offer'].map((h, i) => (
                  <th key={i} className={`text-right ${i === 0 || i === 3 || i === 6 || i === 8 ? 'border-l border-line' : ''}`}>
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
                    <td className="border-l border-line text-right">{p3(r.p_convert_none)}</td>
                    <td className="text-right">{p3(r.p_convert_nudge)}</td>
                    <td className="text-right">{p3(r.p_convert_discount)}</td>
                    <td className="border-l border-line text-right">{p3(r.p_cancel_none)}</td>
                    <td className="text-right">{p3(r.p_cancel_nudge)}</td>
                    <td className="text-right">{p3(r.p_cancel_discount)}</td>
                    <td className="border-l border-line text-right">{p3(r.r_cod_none)}</td>
                    <td className="text-right">{p3(r.r_pre_none)}</td>
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
            Page {page} of {pages}
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
