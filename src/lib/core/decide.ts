// Step 2 of the pipeline: turn model probabilities into expected net ₹ and pick an action.
// Pure function. No I/O, no randomness (random draws are passed in).

export type Action = 'none' | 'nudge' | 'discount';
export const ACTIONS: Action[] = ['none', 'nudge', 'discount'];

export type Group = 'model' | 'holdout' | 'explore';
export type ReasonCode = 'best_gain' | 'no_positive_gain' | 'cap_applied' | 'holdout' | 'explore';

/** Four model probabilities for one action. */
export interface ActionProbs {
  /** P(a): converts to prepaid */
  p: number;
  /** K(a): cancels before dispatch */
  k: number;
  /** Rc(a): RTO if the order stays COD */
  rc: number;
  /** Rp(a): RTO if the order goes prepaid */
  rp: number;
}

export type Probs = Record<Action, ActionProbs>;

export interface Economics {
  /** m: margin on a delivered order */
  margin: number;
  /** F: COD cash-handling fee */
  codFee: number;
  /** C: cost of one RTO */
  rtoCost: number;
  /** D: discount amount set by the merchant */
  discountAmount: number;
  /** Max discount per order */
  maxDiscount: number;
  /** M: message cost for this order's channel */
  messageCost: number;
}

export const OUTCOME_LABELS = [
  'Prepaid delivered',
  'Prepaid returned (RTO)',
  'Cancelled',
  'COD delivered',
  'COD returned (RTO)',
] as const;

export interface ActionBreakdown {
  action: Action;
  /** D(a) used */
  discount: number;
  /** M(a) used */
  messageCost: number;
  /** π1..π5 */
  pi: number[];
  /** payoff for each of the five outcomes */
  payoff: number[];
  /** π × payoff */
  contribution: number[];
  /** EV(a) = Σ π × payoff − M(a) */
  ev: number;
}

export function evaluateAction(action: Action, pr: ActionProbs, econ: Economics): ActionBreakdown {
  const D = action === 'discount' ? econ.discountAmount : 0;
  const M = action === 'none' ? 0 : econ.messageCost;
  const { p, k, rc, rp } = pr;
  const stayCod = 1 - p - k;
  const pi = [p * (1 - rp), p * rp, k, stayCod * (1 - rc), stayCod * rc];
  const payoff = [econ.margin - D, -econ.rtoCost, 0, econ.margin - econ.codFee, -econ.rtoCost];
  const contribution = pi.map((x, i) => x * payoff[i]);
  const ev = contribution.reduce((s, x) => s + x, 0) - M;
  return { action, discount: D, messageCost: M, pi, payoff, contribution, ev };
}

export interface DecideInput {
  probs: Probs;
  econ: Economics;
  /** 0..1 */
  holdoutPct: number;
  /** 0..1 */
  explorationPct: number;
  /** uniform draws in [0,1): group assignment and explore arm */
  draws: { uGroup: number; uExplore: number };
}

export interface DecideOutput {
  group: Group;
  breakdown: Record<Action, ActionBreakdown>;
  ev: Record<Action, number>;
  gain: { nudge: number; discount: number };
  discountAvailable: boolean;
  chosen: Action;
  reason: ReasonCode;
  discountApplied: number;
}

export function discountAvailable(econ: Economics): boolean {
  return econ.discountAmount > 0 && econ.discountAmount <= econ.maxDiscount;
}

export function decide(input: DecideInput): DecideOutput {
  const { probs, econ, holdoutPct, explorationPct, draws } = input;
  const breakdown = {
    none: evaluateAction('none', probs.none, econ),
    nudge: evaluateAction('nudge', probs.nudge, econ),
    discount: evaluateAction('discount', probs.discount, econ),
  };
  const ev = { none: breakdown.none.ev, nudge: breakdown.nudge.ev, discount: breakdown.discount.ev };
  const gain = { nudge: ev.nudge - ev.none, discount: ev.discount - ev.none };
  const canDiscount = discountAvailable(econ);

  const base = { breakdown, ev, gain, discountAvailable: canDiscount };

  // Rule 1: assign the group first.
  if (draws.uGroup < holdoutPct) {
    return { ...base, group: 'holdout', chosen: 'none', reason: 'holdout', discountApplied: 0 };
  }
  if (draws.uGroup < holdoutPct + explorationPct) {
    const chosen: Action = canDiscount && draws.uExplore >= 0.5 ? 'discount' : 'nudge';
    return {
      ...base,
      group: 'explore',
      chosen,
      reason: 'explore',
      discountApplied: chosen === 'discount' ? econ.discountAmount : 0,
    };
  }

  // Rule 2 + 3: model group picks the highest positive gain among configured actions.
  let chosen: Action = 'none';
  let best = 0;
  if (gain.nudge > best) {
    chosen = 'nudge';
    best = gain.nudge;
  }
  if (canDiscount && gain.discount > best) {
    chosen = 'discount';
    best = gain.discount;
  }
  let reason: ReasonCode = chosen === 'none' ? 'no_positive_gain' : 'best_gain';
  if (!canDiscount && gain.discount > 0 && gain.discount > gain.nudge) reason = 'cap_applied';

  return {
    ...base,
    group: 'model',
    chosen,
    reason,
    discountApplied: chosen === 'discount' ? econ.discountAmount : 0,
  };
}
