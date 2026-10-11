import Link from 'next/link';
import { ACTION_LABEL, GROUP_LABEL, LIFECYCLE_LABEL, REASON_LABEL, inr, orderCode, pct, prob, simTime } from '@/lib/format';
import { OUTCOME_LABELS } from '@/lib/core/decide.ts';
import { FEATURE_NAMES } from '@/lib/core/model.ts';
import { getDb } from '@/lib/server/db.ts';
import { inspectorOrder } from '@/lib/server/results.ts';

export const dynamic = 'force-dynamic';

const ACTIONS = ['none', 'nudge', 'discount'] as const;
const FEATURE_LABEL: Record<string, string> = {
  delivered_orders: 'Delivered orders',
  rto_count: 'RTO count',
  cod_share: 'COD share of history',
  past_offer_response_rate: 'Past offer response rate',
  past_delivery_issue: 'Past delivery issue',
  days_since_last_order: 'Days since last order',
  order_value: 'Order value',
  city_tier: 'City tier',
  channel_whatsapp: 'Channel',
};
const PI_FORMULA = ['P × (1 − Rp)', 'P × Rp', 'K', '(1 − P − K) × (1 − Rc)', '(1 − P − K) × Rc'];

function Section({ n, title, sub, children }: { n?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="text-sm">
          {n && <span className="mr-2 font-mono text-rzp">{n}</span>}
          {title}
        </h2>
        {sub && <p className="text-xs text-ink-faint">{sub}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Lookup({ run, order }: { run?: string; order?: string }) {
  return (
    <form method="get" className="card flex flex-wrap items-end gap-3 px-4 py-3">
      <label className="text-xs">
        <div className="label">Run id</div>
        <input name="run" defaultValue={run} className="input mt-0.5 w-28 font-mono" placeholder="e.g. 1" />
      </label>
      <label className="text-xs">
        <div className="label">Order id (optional)</div>
        <input name="order" defaultValue={order} className="input mt-0.5 w-36 font-mono" placeholder="e.g. 15042" />
      </label>
      <button className="btn btn-primary" type="submit">
        Look up
      </button>
    </form>
  );
}

export default async function InspectorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const runId = Number(sp.run);
  const orderId = Number(String(sp.order ?? '').replace(/^VD-0*/i, ''));
  const db = getDb();

  if (!runId) {
    return (
      <div className="space-y-4">
        <Lookup />
        <p className="text-sm text-ink-soft">Look up a decision by run id, or by run id and order id. Open it from any row on the Messages page.</p>
      </div>
    );
  }

  if (!orderId) {
    const examples = await db.query(
      `select ro.order_id, d.chosen_action, ro.assignment_group, d.gain_nudge, d.gain_discount
       from run_orders ro join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
       where ro.run_id = $1 and ro.assignment_group = 'model'
       order by abs(d.gain_nudge - d.gain_discount) asc limit 12`,
      [runId],
    );
    return (
      <div className="space-y-4">
        <Lookup run={String(runId)} />
        <Section title={`Run #${runId}`} sub="Run view (distribution, histogram, reason codes) is part of a later build step. Pick an order to inspect.">
          <div className="text-xs text-ink-soft">Model-group orders where the nudge and discount were closest:</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((e) => (
              <Link key={e.order_id} href={`/inspector?run=${runId}&order=${e.order_id}`} className="btn btn-sm font-mono">
                {orderCode(e.order_id)} · {ACTION_LABEL[e.chosen_action]}
              </Link>
            ))}
          </div>
        </Section>
      </div>
    );
  }

  const data = await inspectorOrder(db, runId, orderId);
  if (!data) {
    return (
      <div className="space-y-4">
        <Lookup run={String(runId)} order={String(orderId)} />
        <div className="card card-pad text-sm text-ink-faint">
          Order {orderCode(orderId)} is not in run #{runId}.
        </div>
      </div>
    );
  }
  const { row, events, sends } = data;
  const f = row.features ?? {};
  const det = row.detail ?? null;
  const bd = det?.breakdown ?? null;
  const pr = (k: string, a: string) => row[`${k}_${a}`];
  const chosen = row.chosen_action as string | null;
  const ev = { none: Number(row.ev_none), nudge: Number(row.ev_nudge), discount: Number(row.ev_discount) };
  const gains = { nudge: Number(row.gain_nudge), discount: Number(row.gain_discount) };

  let why: string | null = null;
  if (bd && chosen) {
    const D = Number(bd.discount.discount);
    const discountCost = bd.discount.pi[0] * D;
    const liftValue = ev.discount - ev.nudge + discountCost;
    if (chosen === 'nudge') {
      why = `The nudge gains ${inr(gains.nudge, 2)} over doing nothing and the discount gains ${inr(gains.discount, 2)}. The discount lifts conversion from ${pct(Number(pr('p_convert', 'nudge')))} to ${pct(Number(pr('p_convert', 'discount')))}, worth ${inr(liftValue, 2)} in expected value, but it gives ${inr(D)} off on an expected ${prob(bd.discount.pi[0], 3)} prepaid deliveries, which costs ${inr(discountCost, 2)}. The extra conversion does not pay for the discount, so the nudge wins.`;
    } else if (chosen === 'discount') {
      why = `The discount gains ${inr(gains.discount, 2)} over doing nothing and the nudge gains ${inr(gains.nudge, 2)}. The discount lifts conversion from ${pct(Number(pr('p_convert', 'nudge')))} to ${pct(Number(pr('p_convert', 'discount')))}, worth ${inr(liftValue, 2)}, more than the ${inr(discountCost, 2)} expected cost of the ${inr(D)} discount.`;
    } else if (row.reason_code === 'no_positive_gain') {
      why = `Neither message beats doing nothing: nudge gain ${inr(gains.nudge, 2)}, discount gain ${inr(gains.discount, 2)}.`;
    }
  }

  return (
    <div className="space-y-4">
      <Lookup run={String(runId)} order={String(orderId)} />

      <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div>
          <div className="label">Order</div>
          <div className="font-mono text-lg font-semibold">{orderCode(orderId)}</div>
        </div>
        <div>
          <div className="label">Run</div>
          <div className="font-medium">#{runId}</div>
        </div>
        <div>
          <div className="label">Model version</div>
          <div className="font-medium">v{row.model_version ?? row.run_model_version}</div>
        </div>
        <div>
          <div className="label">Assignment group</div>
          <div className="font-medium">{row.assignment_group ? GROUP_LABEL[row.assignment_group] : '—'}</div>
        </div>
        <div>
          <div className="label">Chosen action</div>
          <div className="font-medium">{chosen ? ACTION_LABEL[chosen] : '—'}</div>
        </div>
        <div>
          <div className="label">Reason code</div>
          <div className="font-medium">{row.reason_code ? REASON_LABEL[row.reason_code] : '—'}</div>
        </div>
        <div>
          <div className="label">Status</div>
          <div className="font-medium">{LIFECYCLE_LABEL[row.lifecycle_state]}</div>
        </div>
        <div>
          <div className="label">Training</div>
          <div className="font-medium">{row.used_in_training_version ? `Used in v${row.used_in_training_version}` : 'Not used'}</div>
        </div>
      </div>

      {why && (
        <div className="rounded-lg border border-rzp/30 bg-rzp-soft px-4 py-3 text-sm">
          <span className="font-semibold">Why {chosen ? ACTION_LABEL[chosen].toLowerCase() : 'this'}: </span>
          {why}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Section title="Customer features as the model saw them" sub="Frozen when the order was placed. Hidden types are never shown to the model.">
          <table className="table-base">
            <tbody>
              {FEATURE_NAMES.map((k) => (
                <tr key={k}>
                  <td className="text-ink-soft">{FEATURE_LABEL[k]}</td>
                  <td className="text-right font-medium">
                    {k === 'channel_whatsapp'
                      ? f.channel === 'whatsapp'
                        ? 'WhatsApp'
                        : 'Mobile inbox'
                      : k === 'past_delivery_issue'
                        ? f.past_delivery_issue
                          ? 'Yes'
                          : 'No'
                        : k === 'order_value'
                          ? inr(f.order_value)
                          : k === 'cod_share' || k === 'past_offer_response_rate'
                            ? Number(f[k]).toFixed(2)
                            : f[k]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="col-span-2">
          <Section n="Step 1" title="Score · model probabilities" sub="Eight logistic regressions. Rc is one model, so it is the same for every action.">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Probability</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="text-right">
                      {ACTION_LABEL[a]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['p_convert', 'P(a) · converts to prepaid'],
                  ['p_cancel', 'K(a) · cancels before dispatch'],
                  ['r_cod', 'Rc(a) · RTO if stays COD'],
                  ['r_pre', 'Rp(a) · RTO if prepaid'],
                ].map(([k, label]) => (
                  <tr key={k}>
                    <td className="text-ink-soft">{label}</td>
                    {ACTIONS.map((a) => (
                      <td key={a} className="text-right font-mono">
                        {prob(pr(k, a), 4)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      </div>

      {bd && (
        <Section
          n="Step 2"
          title="Decide · expected net ₹ per action"
          sub={`Inputs: margin m ${inr(det.econ.margin)}, cash fee F ${inr(det.econ.codFee)}, RTO cost C ${inr(det.econ.rtoCost)}, discount D ${inr(det.econ.discountAmount)}, message cost M ${inr(det.econ.messageCost, 2)} on ${f.channel === 'whatsapp' ? 'WhatsApp' : 'mobile inbox'}.`}
        >
          <div className="grid grid-cols-3 gap-3">
            {ACTIONS.map((a) => {
              const b = bd[a];
              const isChosen = chosen === a;
              return (
                <div key={a} className={`rounded-md border ${isChosen ? 'border-brand-500 ring-2 ring-brand-100' : 'border-line'}`}>
                  <div className="flex items-center justify-between border-b border-line px-3 py-2">
                    <span className="text-sm font-semibold">{ACTION_LABEL[a]}</span>
                    {isChosen && <span className="pill bg-brand-600 text-white">Chosen</span>}
                  </div>
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Outcome</th>
                        <th className="text-right">π</th>
                        <th className="text-right">Payoff</th>
                        <th className="text-right">π × payoff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {OUTCOME_LABELS.map((lbl, i) => (
                        <tr key={lbl}>
                          <td className="text-ink-soft" title={PI_FORMULA[i]}>
                            π{i + 1} {lbl}
                          </td>
                          <td className="text-right font-mono">{prob(b.pi[i], 4)}</td>
                          <td className="text-right">{inr(b.payoff[i])}</td>
                          <td className="text-right">{inr(b.contribution[i], 2)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="text-ink-soft">− Message cost M(a)</td>
                        <td />
                        <td />
                        <td className="text-right">{inr(-b.messageCost, 2)}</td>
                      </tr>
                      <tr>
                        <td className="font-semibold">EV({a})</td>
                        <td />
                        <td />
                        <td className="text-right font-semibold">{inr(b.ev, 2)}</td>
                      </tr>
                      <tr>
                        <td className="font-semibold">Gain vs none</td>
                        <td />
                        <td />
                        <td className={`text-right font-semibold ${a === 'none' ? 'text-ink-faint' : b.ev - ev.none > 0 ? 'text-brand-700' : 'text-red-700'}`}>
                          {a === 'none' ? '—' : inr(b.ev - bd.none.ev, 2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded-md bg-canvas p-3 text-xs text-ink-soft">
            <div className="font-semibold text-ink">Decision rules, in order</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>
                Group: random draw {Number(det.draws.uGroup).toFixed(3)} vs holdout {pct(det.holdout_pct, 0)} and exploration {pct(det.exploration_pct, 0)} →{' '}
                <span className="font-medium text-ink">{GROUP_LABEL[row.assignment_group]}</span>
                {row.assignment_group === 'explore' && ` (arm draw ${Number(det.draws.uExplore).toFixed(3)})`}
              </li>
              <li>
                Model orders take the highest gain above ₹0: nudge {inr(gains.nudge, 2)}, discount {inr(gains.discount, 2)}
              </li>
              <li>
                Discount {det.discount_available ? 'available' : 'removed by the max-discount cap'} (D {inr(det.econ.discountAmount)} ≤ max {inr(det.econ.maxDiscount)}) → reason:{' '}
                <span className="font-medium text-ink">{REASON_LABEL[row.reason_code]}</span>
              </li>
            </ol>
          </div>
        </Section>
      )}

      {row.final_text ? (
        <Section n="Step 3" title="Draft · LLM message" sub="The LLM only writes the wording. It never picks the action or the discount, and wording does not change simulated outcomes.">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="label mb-1">Prompt</div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-ink p-3 font-mono text-2xs leading-relaxed text-white/90">{row.llm_prompt}</pre>
            </div>
            <div className="space-y-3">
              <div>
                <div className="label mb-1">LLM output{row.fallback_used ? ' · fallback template used' : ''}</div>
                <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-canvas p-3 font-mono text-2xs">{row.llm_output}</pre>
              </div>
              {row.edited_text && (
                <div>
                  <div className="label mb-1">Merchant edit</div>
                  <div className="rounded-md border border-rzp/30 bg-rzp-soft p-3 text-sm">{row.edited_text}</div>
                </div>
              )}
              <div>
                <div className="label mb-1">
                  Final text · {row.variant_tag} · {row.channel === 'whatsapp' ? 'WhatsApp' : 'mobile inbox'} · review {row.review}
                </div>
                <div className="rounded-md border border-brand-200 bg-brand-50 p-3 text-sm">{row.final_text}</div>
              </div>
            </div>
          </div>
        </Section>
      ) : (
        <Section n="Step 3" title="Draft · LLM message">
          <p className="text-sm text-ink-faint">No message: the action is {chosen ? ACTION_LABEL[chosen].toLowerCase() : 'not decided yet'}.</p>
        </Section>
      )}

      <Section title="Send events and outcome">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="label mb-1">Sends</div>
            {sends.length === 0 && <div className="text-ink-faint">Not sent.</div>}
            {sends.map((s) => (
              <div key={s.id}>
                Run #{s.run_id} · attempt {s.attempt} · {ACTION_LABEL[s.action]} · {simTime(s.sent_at)}
              </div>
            ))}
            <div className="label mb-1 mt-3">Events</div>
            {events.length === 0 && <div className="text-ink-faint">None yet.</div>}
            <ol className="space-y-0.5">
              {events.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 font-mono text-xs text-ink-faint">{simTime(e.at)}</span>
                  <span className="capitalize">{e.type}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-1">
            <div className="label mb-1">Order</div>
            <div>Placed {simTime(row.placed_at)} · dispatch deadline {simTime(row.dispatch_deadline)}</div>
            <div>
              Converted to prepaid: {row.converted_at ? `yes, ${simTime(row.converted_at)} via ${row.converted_via === 'organic' ? 'the customer on their own' : row.converted_via}` : 'no'}
            </div>
            <div>Final outcome: {row.final_outcome ? `${row.final_outcome === 'rto' ? 'RTO' : row.final_outcome} at ${simTime(row.outcome_at)}` : 'pending'}</div>
            <div>
              Discount paid {inr(Number(row.discount_paid))} · message cost {inr(Number(row.message_cost), 2)}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
