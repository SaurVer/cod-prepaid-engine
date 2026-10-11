// "Out of 100 orders like this one…": the expected-profit maths in plain words. No hooks (server or client).

import { ACTION_LABEL, inr } from '@/lib/format';

export interface Breakdown {
  pi: number[];
  payoff: number[];
  contribution: number[];
  ev: number;
  messageCost: number;
  discount: number;
}

export interface Econ {
  margin: number;
  codFee: number;
  rtoCost: number;
  discountAmount: number;
}

const ACTIONS = ['none', 'nudge', 'discount'] as const;
const IF: Record<string, string> = { none: 'If we send nothing', nudge: 'If we send a reminder', discount: 'If we send the ₹50 off offer' };

const per100 = (x: number) => {
  const v = x * 100;
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
};

export function ProfitBreakdown({ breakdown, econ, chosen }: { breakdown: Record<string, Breakdown>; econ: Econ; chosen?: string | null }) {
  const none = breakdown.none.ev;
  const best = ACTIONS.reduce((a, b) => (breakdown[b].ev > breakdown[a].ev ? b : a), 'none' as (typeof ACTIONS)[number]);
  return (
    <div className="grid grid-cols-3 gap-3">
      {ACTIONS.map((a) => {
        const b = breakdown[a];
        const D = b.discount;
        const rows = [
          { n: b.pi[0], what: 'pay online and are delivered', each: b.payoff[0], why: D ? `${inr(econ.margin)} profit − ${inr(D)} off` : `${inr(econ.margin)} profit`, tone: 'text-ok' },
          { n: b.pi[1], what: 'pay online but are returned', each: b.payoff[1], why: 'cost of a return', tone: 'text-bad' },
          { n: b.pi[2], what: 'cancel before shipping', each: b.payoff[2], why: 'nothing earned or lost', tone: 'text-ink-faint' },
          { n: b.pi[3], what: 'pay cash and are delivered', each: b.payoff[3], why: `${inr(econ.margin)} profit − ${inr(econ.codFee)} cash fee`, tone: 'text-ok' },
          { n: b.pi[4], what: 'pay cash but are returned', each: b.payoff[4], why: 'cost of a return', tone: 'text-bad' },
        ];
        const total100 = b.contribution.reduce((s, x) => s + x, 0) * 100;
        const isChosen = chosen === a;
        return (
          <div key={a} className={`flex flex-col rounded-xl border bg-white ${isChosen ? 'border-rzp ring-2 ring-rzp-soft' : 'border-line'}`}>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <span className="font-semibold">{IF[a]}</span>
              {isChosen && <span className="pill bg-rzp text-white">AI&apos;s choice</span>}
              {!isChosen && a === best && <span className="pill bg-ok-soft text-ok">Most profitable</span>}
            </div>
            <div className="flex-1 px-4 py-3 text-[12.5px]">
              <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-faint">Out of 100 orders like this one</div>
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <li key={r.what} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <b className="tabular-nums text-ink">{per100(r.n)}</b> <span className="text-ink-soft">{r.what}</span>
                      <span className="block text-[11px] text-ink-faint">
                        {inr(r.each)} each · {r.why}
                      </span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${r.tone}`}>{inr(r.n * r.each * 100)}</span>
                  </li>
                ))}
                {b.messageCost > 0 && (
                  <li className="flex items-start justify-between gap-3">
                    <span className="text-ink-soft">
                      Message cost <span className="block text-[11px] text-ink-faint">100 × {inr(b.messageCost, 2)}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-bad">−{inr(b.messageCost * 100)}</span>
                  </li>
                )}
              </ul>
            </div>
            <div className="space-y-1 border-t border-line bg-panel/60 px-4 py-2.5 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-ink-soft">Profit from 100 orders</span>
                <span className="tabular-nums">{inr(total100 - b.messageCost * 100)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Expected profit per order</span>
                <span className="tabular-nums">{inr(b.ev, 2)}</span>
              </div>
              {a !== 'none' && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-ink-soft">Compared with sending nothing</span>
                  <span className={`font-semibold tabular-nums ${b.ev - none > 0 ? 'text-ok' : 'text-bad'}`}>
                    {b.ev - none > 0 ? '+' : ''}
                    {inr(b.ev - none, 2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One plain sentence: what was chosen and why. */
export function decisionSentence(breakdown: Record<string, Breakdown>, chosen: string, reason: string): string {
  const none = breakdown.none.ev;
  const g = { nudge: breakdown.nudge.ev - none, discount: breakdown.discount.ev - none };
  const D = inr(breakdown.discount.discount);
  const fmt = (x: number) => `${x >= 0 ? '+' : ''}${inr(x, 2)}`;
  if (reason === 'holdout')
    return `This order was picked at random for the control group, so it got no message on purpose. Control orders show what happens without the campaign. (Had the AI decided, a reminder was worth ${fmt(g.nudge)} and the offer ${fmt(g.discount)} per order.)`;
  if (reason === 'explore')
    return `This order was picked at random for the random test and got a ${ACTION_LABEL[chosen].toLowerCase()} by chance, so the model keeps learning how customers respond. (The AI itself expected a reminder to be worth ${fmt(g.nudge)} and the offer ${fmt(g.discount)} per order.)`;
  if (chosen === 'none')
    return `Sending nothing is best: a reminder would change profit by ${fmt(g.nudge)} per order and the offer by ${fmt(g.discount)}. Neither is worth the message.`;
  if (chosen === 'nudge')
    return `A reminder adds ${fmt(g.nudge)} per order compared with sending nothing, more than the offer's ${fmt(g.discount)}. The offer would make a few more customers pay online, but the ${D} off would also go to everyone who would have paid online with just a reminder.`;
  return `The ${D} off offer adds ${fmt(g.discount)} per order compared with sending nothing, more than a reminder's ${fmt(g.nudge)}. This customer is unlikely to switch without an incentive, and the extra online payments outweigh the discount.`;
}
