import Link from 'next/link';
import { ProfitBreakdown, decisionSentence } from '@/components/profit-breakdown';
import { ACTION_LABEL, GROUP_LABEL, LIFECYCLE_LABEL, inr, orderCode, pct, simTime } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { inspectorOrder } from '@/lib/server/results.ts';

export const dynamic = 'force-dynamic';

const ACTIONS = ['none', 'nudge', 'discount'] as const;
const EVENT_LABEL: Record<string, string> = {
  delivered: 'Message delivered',
  opened: 'Message opened',
  clicked: 'Pay-online link clicked',
  converted: 'Paid online',
};

function Section({ n, title, sub, children }: { n?: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="flex items-center text-[14px]">
          {n && <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-rzp text-[11px] text-white">{n}</span>}
          {title}
        </h2>
        {sub && <p className="text-xs text-ink-faint">{sub}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Lookup({ run, order }: { run?: string; order?: string }) {
  return (
    <form method="get" className="card flex flex-wrap items-end gap-3 px-4 py-3">
      <label className="text-xs">
        <div className="label">Campaign number</div>
        <input name="run" defaultValue={run} className="input mt-0.5 w-28 font-mono" placeholder="e.g. 1" />
      </label>
      <label className="text-xs">
        <div className="label">Order (optional)</div>
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
  const orderId = Number(String(sp.order ?? '').replace(/^(DL|VD|EV)-0*/i, ''));
  const db = getDb();

  if (!runId) {
    return (
      <div className="space-y-4">
        <Lookup />
        <p className="text-[13px] text-ink-soft">Look up a decision by campaign number and order. The easiest way in is the “Why?” link on any order.</p>
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
        <Section title={`Campaign ${runId}`} sub="Pick an order to see its decision step by step.">
          <div className="text-[12px] text-ink-soft">AI-decided orders where the reminder and the offer were closest:</div>
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
          Order {orderCode(orderId)} is not in campaign {runId}.
        </div>
      </div>
    );
  }
  const { row, events, sends } = data;
  const f = row.features ?? {};
  const det = row.detail ?? null;
  const bd = det?.breakdown ?? null;
  const pr = (k: string, a: string) => Number(row[`${k}_${a}`]);
  const chosen = row.chosen_action as string | null;
  const back = sp.back && sp.back.startsWith('/') ? sp.back : `/campaigns/${runId}`;
  const econ = det?.econ
    ? { margin: Number(det.econ.margin), codFee: Number(det.econ.codFee), rtoCost: Number(det.econ.rtoCost), discountAmount: Number(det.econ.discountAmount) }
    : null;
  const facts: [string, string][] = [
    ['Past orders delivered', String(f.delivered_orders)],
    ['Past orders returned', String(f.rto_count)],
    ['Past orders paid by cash', pct(Number(f.cod_share), 0)],
    ['Took up past offers', pct(Number(f.past_offer_response_rate), 0)],
    ['Had a delivery problem before', f.past_delivery_issue ? 'Yes' : 'No'],
    ['Days since last order', String(f.days_since_last_order)],
    ['This order’s value', inr(f.order_value)],
    ['City tier', `Tier ${f.city_tier}`],
    ['Reached on', f.channel === 'whatsapp' ? 'WhatsApp' : 'Mobile inbox'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={back} className="text-[12.5px] font-medium text-rzp hover:underline">
          ← Back
        </Link>
        <details className="text-[12px]">
          <summary className="cursor-pointer text-ink-faint">Look up another order</summary>
          <div className="mt-2">
            <Lookup run={String(runId)} order={String(orderId)} />
          </div>
        </details>
      </div>

      <div className="card flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3.5">
        <div>
          <div className="label">Order</div>
          <div className="font-mono text-lg font-semibold">{orderCode(orderId)}</div>
        </div>
        <div>
          <div className="label">Campaign</div>
          <Link href={`/campaigns/${runId}`} className="link">
            #{runId}
          </Link>
        </div>
        <div>
          <div className="label">Group</div>
          <div className="font-medium">{row.assignment_group ? GROUP_LABEL[row.assignment_group] : '—'}</div>
        </div>
        <div>
          <div className="label">Decision</div>
          <div className="font-medium">{chosen ? ACTION_LABEL[chosen] : '—'}</div>
        </div>
        <div>
          <div className="label">Status now</div>
          <div className="font-medium">{LIFECYCLE_LABEL[row.lifecycle_state]}</div>
        </div>
        <div>
          <div className="label">Model</div>
          <div className="font-medium">v{row.model_version ?? row.run_model_version}</div>
        </div>
      </div>

      {bd && chosen && (
        <div className="rounded-xl border border-rzp/30 bg-rzp-soft px-5 py-3.5 text-[13.5px] leading-relaxed">
          <span className="font-semibold">Why {ACTION_LABEL[chosen].toLowerCase()}? </span>
          {decisionSentence(bd, chosen, row.reason_code)}
        </div>
      )}

      <Section n="1" title="What we knew about this customer" sub="Taken from their order history when the order was placed. This is all the AI sees.">
        <div className="grid grid-cols-3 gap-2">
          {facts.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between gap-3 rounded-lg bg-panel px-3 py-2 text-[12.5px]">
              <span className="text-ink-soft">{l}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="2" title="What the AI predicted" sub="The chance of each thing happening, for each choice. Returns don’t depend on the message, only on whether the order is paid in cash or online.">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.04em] text-ink-faint">
              <th className="py-1.5 font-semibold">Chance that…</th>
              {ACTIONS.map((a) => (
                <th key={a} className={`py-1.5 text-right font-semibold ${chosen === a ? 'text-rzp' : ''}`}>
                  {a === 'none' ? 'If we send nothing' : a === 'nudge' ? 'With a reminder' : 'With the offer'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['p_convert', 'the customer pays online'],
              ['p_cancel', 'the customer cancels before shipping'],
              ['r_cod', 'the order is returned, if paid in cash'],
              ['r_pre', 'the order is returned, if paid online'],
            ].map(([k, label]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-2 text-ink-soft">…{label}</td>
                {ACTIONS.map((a) => (
                  <td key={a} className={`py-2 text-right tabular-nums ${chosen === a ? 'font-semibold text-ink' : ''}`}>
                    {pct(pr(k, a))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {bd && econ && (
        <Section n="3" title="What each choice is worth" sub="The chances above, turned into money. Imagine 100 customers exactly like this one.">
          <ProfitBreakdown breakdown={bd} econ={econ} chosen={chosen} />
          <div className="mt-3 rounded-lg bg-panel px-4 py-3 text-[12.5px] text-ink-soft">
            <b className="text-ink">How the AI picks:</b> first, a few orders are set aside at random (control group {pct(det.holdout_pct, 0)}, random test{' '}
            {pct(det.exploration_pct, 0)}); this order went to <b className="text-ink">{GROUP_LABEL[row.assignment_group]}</b>. For every other order, the AI sends
            whichever message adds the most profit compared with sending nothing, and sends nothing if no message adds profit.
            {!det.discount_available && ' The offer was not allowed because it is above your max discount.'}
          </div>
        </Section>
      )}

      <Section n="4" title="The message" sub="Written by AI in your brand tone. It only writes the words; it never picks the action or the discount.">
        {row.final_text ? (
          <div className="space-y-3">
            <div className="max-w-xl rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-3 text-[13.5px] shadow-card">{row.final_text}</div>
            <div className="text-[12px] text-ink-faint">
              {row.channel === 'whatsapp' ? 'WhatsApp' : 'Mobile inbox'} · {row.fallback_used ? 'standard template (the AI draft did not pass the checks)' : 'written by AI'}
              {row.edited_text ? ' · edited by you' : ''}
            </div>
            <details className="text-[12px]">
              <summary className="cursor-pointer text-ink-faint">Show what the AI was asked and what it returned</summary>
              <div className="mt-2 grid grid-cols-2 gap-4">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-ink p-3 font-mono text-2xs leading-relaxed text-white/90">{row.llm_prompt}</pre>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-panel p-3 font-mono text-2xs">{row.llm_output}</pre>
              </div>
            </details>
          </div>
        ) : (
          <p className="text-[13px] text-ink-faint">No message was sent to this customer.</p>
        )}
      </Section>

      <Section n="5" title="What happened">
        <ol className="space-y-1.5 text-[13px]">
          <li className="flex gap-4">
            <span className="w-32 shrink-0 text-ink-faint">{simTime(row.placed_at)}</span>Order placed, cash on delivery
          </li>
          {sends.map((s) => (
            <li key={s.id} className="flex gap-4">
              <span className="w-32 shrink-0 text-ink-faint">{simTime(s.sent_at)}</span>
              {ACTION_LABEL[s.action]} sent
            </li>
          ))}
          {events.map((e, i) => (
            <li key={i} className="flex gap-4">
              <span className="w-32 shrink-0 text-ink-faint">{simTime(e.at)}</span>
              {EVENT_LABEL[e.type] ?? e.type}
            </li>
          ))}
          {row.converted_at && row.converted_via === 'organic' && (
            <li className="flex gap-4">
              <span className="w-32 shrink-0 text-ink-faint">{simTime(row.converted_at)}</span>Paid online on their own
            </li>
          )}
          <li className="flex gap-4">
            <span className="w-32 shrink-0 text-ink-faint">{row.final_outcome ? simTime(row.outcome_at) : '—'}</span>
            {row.final_outcome
              ? row.final_outcome === 'rto'
                ? 'Returned (RTO)'
                : row.final_outcome === 'cancelled'
                  ? 'Cancelled before shipping'
                  : 'Delivered'
              : 'Delivery not known yet (3–5 days after dispatch)'}
          </li>
        </ol>
        {(Number(row.discount_paid) > 0 || Number(row.message_cost) > 0) && (
          <p className="mt-3 text-[12px] text-ink-faint">
            Discount given {inr(Number(row.discount_paid))} · message cost {inr(Number(row.message_cost), 2)}
          </p>
        )}
      </Section>
    </div>
  );
}
