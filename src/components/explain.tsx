// Plain-language explainers shared by the Overview, the run dialog, campaign pages and Settings.
// No hooks: safe in server and client components.

import { inr, num, pct } from '@/lib/format';

/** What the control group, random test and AI-decided orders are for. */
export function GroupsExplainer({
  holdoutPct,
  explorePct,
  counts,
  compact = false,
}: {
  holdoutPct: number;
  explorePct: number;
  counts?: { control: number; random_test: number; ai: number };
  compact?: boolean;
}) {
  const aiPct = Math.max(0, 1 - holdoutPct - explorePct);
  const items = [
    {
      key: 'control',
      title: 'Control group',
      share: holdoutPct,
      n: counts?.control,
      dot: 'bg-ink-faint',
      gets: 'Picked at random. Gets no message.',
      uses: [
        ['Measure', 'Its profit per order is the baseline. The campaign’s extra profit is measured against it.'],
        ['Train', 'Shows how customers behave when nobody messages them.'],
      ],
    },
    {
      key: 'random',
      title: 'Random test',
      share: explorePct,
      n: counts?.random_test,
      dot: 'bg-warn',
      gets: 'Picked at random. Gets a reminder or the offer, chosen at random.',
      uses: [['Train', 'Fair examples of how customers respond to each message, so the model keeps learning. Set to 0% to skip.']],
    },
    {
      key: 'ai',
      title: 'AI-decided',
      share: aiPct,
      n: counts?.ai,
      dot: 'bg-rzp',
      gets: 'Gets the action with the highest expected profit: no message, a reminder or the offer.',
      uses: [['Result', 'Compared with the control group. Never used for training, so the AI cannot learn from its own choices.']],
    },
  ];
  return (
    <div className={`grid grid-cols-3 ${compact ? 'gap-2' : 'gap-3'}`}>
      {items.map((it) => (
        <div key={it.key} className={`rounded-lg border border-line bg-white ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <span className={`h-2 w-2 rounded-full ${it.dot}`} />
              {it.title}
            </span>
            <span className="text-[12px] tabular-nums text-ink-soft">
              {pct(it.share, 0)}
              {it.n != null && <> · {num(it.n)}</>}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-ink-soft">{it.gets}</p>
          <ul className="mt-2 space-y-1">
            {it.uses.map(([tag, text]) => (
              <li key={tag} className="flex gap-2 text-[11.5px] leading-snug text-ink-faint">
                <span
                  className={`mt-px h-fit shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.04em] ${
                    tag === 'Measure' || tag === 'Result' ? 'bg-ok-soft text-ok' : 'bg-rzp-soft text-rzp'
                  }`}
                >
                  {tag}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export interface Economics {
  margin: number;
  cod_fee: number;
  rto_cost: number;
  discount_amount: number;
}

/**
 * How “Extra profit vs control” is worked out, for someone with no stats background.
 * Uses a real measured campaign as the example when there is one.
 */
export function ExtraProfitExplainer({
  econ,
  example,
}: {
  econ: Economics;
  example?: { ai: number; control: number; n: number; total: number; label: string } | null;
}) {
  const ex = example ?? { ai: 272, control: 251, n: 740, total: (272 - 251) * 740, label: '' };
  const gap = ex.ai - ex.control;
  const steps = [
    {
      t: 'Split the orders at random',
      b: 'Before anything is sent, a few orders are picked at random and get no message at all. This is the control group. Everyone else gets what the AI chose.',
    },
    {
      t: 'Wait for the deliveries',
      b: 'A few days later we know what happened to every order: delivered, returned or cancelled, paid in cash or online.',
    },
    {
      t: 'Compare what each order earned',
      b: 'We work out the average money made per order in each group. The difference is what the messages added.',
    },
  ];
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-ink-soft">
      <p>
        It is like a medicine trial: one group gets the medicine, a similar group doesn&apos;t, and you compare. Here the “medicine” is the message.
      </p>
      <ol className="grid grid-cols-3 gap-3">
        {steps.map((st, i) => (
          <li key={st.t} className="rounded-lg bg-panel px-4 py-3">
            <div className="flex items-center gap-2 font-semibold text-ink">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rzp text-[11px] text-white">{i + 1}</span>
              {st.t}
            </div>
            <p className="mt-1 text-[12.5px]">{st.b}</p>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-ok/25 bg-ok-soft px-4 py-3 text-ink">
        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ok">
          {example ? `Real example: ${example.label}` : 'Illustration (made-up numbers until a campaign is measured)'}
        </div>
        <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
          <span>Orders that got the AI&apos;s message earned, on average</span>
          <b className="text-right tabular-nums">{inr(ex.ai, 2)} each</b>
          <span>Orders that got nothing (control group) earned</span>
          <b className="text-right tabular-nums">{inr(ex.control, 2)} each</b>
          <span>So each message added</span>
          <b className={`text-right tabular-nums ${gap >= 0 ? 'text-ok' : 'text-bad'}`}>{inr(gap, 2)} per order</b>
          <span>
            Across the {num(ex.n)} orders that got the AI&apos;s choice: {num(ex.n)} × {inr(gap, 2)}
          </span>
          <b className={`text-right tabular-nums ${ex.total >= 0 ? 'text-ok' : 'text-bad'}`}>= {inr(ex.total)} extra profit</b>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-semibold text-ink">What one order “earns”</div>
          <ul className="mt-1 space-y-0.5 text-[12.5px]">
            <li>
              Delivered, paid in cash: you keep <b className="text-ink">{inr(econ.margin - econ.cod_fee)}</b> ({inr(econ.margin)} profit − {inr(econ.cod_fee)} cash-handling
              fee)
            </li>
            <li>
              Delivered, paid online: you keep <b className="text-ink">{inr(econ.margin)}</b>, or {inr(econ.margin - econ.discount_amount)} if they used the{' '}
              {inr(econ.discount_amount)} off offer
            </li>
            <li>
              Sent back to you (RTO): you lose <b className="text-ink">{inr(econ.rto_cost)}</b> in shipping and handling
            </li>
            <li>Cancelled before shipping: ₹0</li>
            <li>Each message sent also costs a little (₹1 on WhatsApp)</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-ink">Why not just count who paid online?</div>
          <p className="mt-1 text-[12.5px]">
            Some customers would have paid online, cancelled or sent the order back anyway. Both groups come from the same day&apos;s orders and are split at
            random, so the only real difference between them is the message. The gap in earnings is what the message caused, not luck or a good day.
          </p>
        </div>
      </div>
      <p className="text-[12px] text-ink-faint">
        The number shows “Measuring” for 3–5 days, until every order&apos;s delivery is known. Orders in the random test (used only to teach the AI) are not counted.
      </p>
    </div>
  );
}

interface Group {
  n: number;
  converted: number;
  cancelled: number;
  rto: number;
  resolved: number;
  realised_per_order: number | null;
}

/** After sending: the AI-decided orders next to the control group, per 100 orders, in plain words. */
export function ResultComparison({
  ai,
  control,
  econ,
  total,
  replay,
}: {
  ai: Group;
  control: Group;
  econ: Economics;
  total: number | null;
  replay: boolean;
}) {
  const per100 = (x: number, n: number) => (n ? (100 * x) / n : null);
  const shipped = (g: Group) => g.resolved - g.cancelled;
  const rows: { label: string; sub: string; a: number | null; c: number | null; money?: boolean; goodUp: boolean }[] = [
    { label: 'Paid online', sub: 'out of 100 orders', a: per100(ai.converted, ai.n), c: per100(control.converted, control.n), goodUp: true },
    { label: 'Cancelled before shipping', sub: 'out of 100 orders', a: per100(ai.cancelled, ai.n), c: per100(control.cancelled, control.n), goodUp: false },
    {
      label: 'Returned (RTO)',
      sub: 'out of 100 shipped orders with a known outcome',
      a: per100(ai.rto, shipped(ai)),
      c: per100(control.rto, shipped(control)),
      goodUp: false,
    },
    { label: 'Profit per order', sub: 'orders whose delivery is known', a: ai.realised_per_order, c: control.realised_per_order, money: true, goodUp: true },
  ];
  const fmt = (v: number | null, money?: boolean) => (v == null ? '—' : money ? inr(v, 2) : v.toFixed(1));
  const known = ai.resolved + control.resolved;
  const all = ai.n + control.n;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3.5">
        <h2>Did the messages pay off?</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">
          Orders the AI decided for, next to the control group, which was picked at random from the same orders and sent nothing.
        </p>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.04em] text-ink-faint">
            <th className="px-5 py-2 font-semibold" />
            <th className="px-5 py-2 text-right font-semibold">AI-decided · {num(ai.n)} orders</th>
            <th className="px-5 py-2 text-right font-semibold">Control, sent nothing · {num(control.n)} orders</th>
            <th className="px-5 py-2 text-right font-semibold">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.a != null && r.c != null ? r.a - r.c : null;
            const good = d == null || Math.abs(d) < 1e-9 ? null : (d > 0) === r.goodUp;
            return (
              <tr key={r.label} className="border-t border-line">
                <td className="px-5 py-2.5">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-[11.5px] text-ink-faint">{r.sub}</div>
                </td>
                <td className="px-5 py-2.5 text-right text-[15px] font-semibold tabular-nums">{fmt(r.a, r.money)}</td>
                <td className="px-5 py-2.5 text-right text-[15px] tabular-nums text-ink-soft">{fmt(r.c, r.money)}</td>
                <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${good == null ? 'text-ink-faint' : good ? 'text-ok' : 'text-bad'}`}>
                  {d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${r.money ? inr(Math.abs(d), 2) : Math.abs(d).toFixed(1)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={`border-t px-5 py-3.5 text-[13px] ${total == null ? 'border-line bg-panel/60' : total >= 0 ? 'border-ok/20 bg-ok-soft' : 'border-bad/20 bg-bad-soft'}`}>
        {total == null ? (
          <>
            <b>Still measuring.</b> Deliveries are known for {num(known)} of {num(all)} orders; the final number appears when all are known (3–5 days after
            shipping).
          </>
        ) : (
          <>
            <b className={total >= 0 ? 'text-ok' : 'text-bad'}>
              {total >= 0 ? `The campaign earned ${inr(total)} more` : `The campaign earned ${inr(-total)} less`} than sending nothing would have.
            </b>{' '}
            <span className="text-ink-soft">
              That is the profit gap per order ({inr(ai.realised_per_order, 2)} − {inr(control.realised_per_order, 2)}) × {num(ai.n)} AI-decided orders.
              {total < 0 && ' On this day the messages and discounts cost more than the extra online payments brought in.'}
            </span>
          </>
        )}
      </div>
      <div className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-faint">
        How profit per order is counted: delivered and paid in cash {inr(econ.margin - econ.cod_fee)} ({inr(econ.margin)} − {inr(econ.cod_fee)} cash fee) ·
        delivered and paid online {inr(econ.margin)} minus any discount · returned −{inr(econ.rto_cost)} · cancelled ₹0 · minus the message cost.
        {replay && ' Replay: orders that later paid online on their own were left out (a payment can’t be undone), so the control group shows almost no online payments; both groups were still picked at random from the same orders.'}
      </div>
    </div>
  );
}
