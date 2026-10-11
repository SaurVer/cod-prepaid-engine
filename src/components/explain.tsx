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

/** How “Extra profit vs control” is worked out; fills in the numbers when a campaign is measured. */
export function ExtraProfitExplainer({
  econ,
  ai,
  control,
  n,
  total,
}: {
  econ: Economics;
  ai?: number | null;
  control?: number | null;
  n?: number;
  total?: number | null;
}) {
  const filled = ai != null && control != null && n != null && total != null;
  return (
    <div className="space-y-3 text-[12.5px] leading-relaxed text-ink-soft">
      <div className="rounded-lg bg-panel px-3.5 py-3 font-medium text-ink">
        Extra profit vs control = (profit per order, AI-decided − profit per order, control group) × AI-decided orders
        {filled && (
          <div className="mt-1.5 font-semibold tabular-nums text-ok">
            = ({inr(ai, 2)} − {inr(control, 2)}) × {num(n)} = {inr(total)}
          </div>
        )}
      </div>
      <div>
        <b className="text-ink">Profit per order</b> is what an order actually earned once its delivery is known:
        <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px]">
          <li>Delivered, paid cash: {inr(econ.margin)} − {inr(econ.cod_fee)} cash fee</li>
          <li>Delivered, paid online: {inr(econ.margin)} − any discount</li>
          <li>Returned (RTO): −{inr(econ.rto_cost)}</li>
          <li>Cancelled: ₹0</li>
        </ul>
        <span className="text-[12px]">Message costs are subtracted from every messaged order.</span>
      </div>
      <p>
        <b className="text-ink">Why compare with the control group?</b> Some customers pay online, cancel or return no matter what. The control group is picked at
        random from the same orders and gets no message, so the gap between the two groups is what the messages caused, not luck or a good day.
      </p>
      <p className="text-[11.5px] text-ink-faint">
        It shows “Measuring” until every order’s delivery is known (3–5 days after dispatch). Random-test orders are left out: they are for training.
      </p>
    </div>
  );
}
