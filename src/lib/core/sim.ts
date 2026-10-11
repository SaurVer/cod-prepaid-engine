// Simulation ground truth (Appendix C). Used only to generate data and simulate outcomes.
// Nothing in here is ever shown to the model or the merchant.

import type { Action } from './decide.ts';
import { type Rng, bernoulli, clamp, lognormal, randInt, uniform, weightedPick } from './rng.ts';

export type HiddenType = 'habitual' | 'price_sensitive' | 'delivery_worried' | 'cash_only';
export type Channel = 'whatsapp' | 'mobile_inbox';

export const TYPE_SHARES: Record<HiddenType, number> = {
  habitual: 0.4,
  price_sensitive: 0.25,
  delivery_worried: 0.15,
  cash_only: 0.2,
};

/** Historical pilot under-samples delivery-worried customers (decision 11: ~3% instead of 15%). */
export const PILOT_TYPE_SHARES: Record<HiddenType, number> = {
  habitual: 0.4,
  price_sensitive: 0.25,
  delivery_worried: 0.03,
  cash_only: 0.2,
};

export const BASE_CONVERSION: Record<HiddenType, Record<Action, number>> = {
  habitual: { none: 0.08, nudge: 0.45, discount: 0.52 },
  price_sensitive: { none: 0.03, nudge: 0.08, discount: 0.45 },
  delivery_worried: { none: 0.04, nudge: 0.3, discount: 0.38 },
  cash_only: { none: 0.01, nudge: 0.02, discount: 0.04 },
};

export const CATEGORIES = [
  'Vitamin C serum',
  'Ashwagandha gummies',
  'Rosemary hair oil',
  'Marine collagen',
  'SPF 50 sunscreen',
  'Biotin gummies',
  'Night repair cream',
  'Electrolyte mix',
];

/** Visible customer state (what the merchant and the model can see). */
export interface CustomerState {
  city_tier: number;
  total_orders: number;
  delivered_orders: number;
  rto_count: number;
  cod_orders: number;
  prepaid_orders: number;
  last_category: string;
  past_offer_response_rate: number;
  past_delivery_issue: boolean;
  preferred_channel: Channel;
  days_since_last_order: number;
}

export interface GeneratedCustomer {
  state: CustomerState;
  hiddenType: HiddenType;
}

function rangeWithNoise(rng: Rng, a: number, b: number, noise: number, lo: number, hi: number): number {
  return clamp(uniform(rng, a, b) + uniform(rng, -noise, noise), lo, hi);
}

export function cityTier(rng: Rng): number {
  const r = rng();
  if (r < 0.44) return 3; // Tier 3+
  if (r < 0.72) return 2;
  return 1;
}

/** Generate a repeat customer (at least one delivered order) of a given hidden type. */
export function generateRepeatCustomer(rng: Rng, type: HiddenType): CustomerState {
  let delivered: number;
  let prepaid: number;
  let offer: number;
  let issueP: number;
  let whatsappP: number;
  switch (type) {
    case 'habitual':
      delivered = randInt(rng, 3, 8);
      prepaid = randInt(rng, 0, 1);
      offer = rangeWithNoise(rng, 0.0, 0.2, 0.05, 0, 1);
      issueP = 0.05;
      whatsappP = 0.85;
      break;
    case 'price_sensitive':
      delivered = randInt(rng, 2, 5);
      prepaid = randInt(rng, 0, 2);
      offer = rangeWithNoise(rng, 0.5, 0.9, 0.05, 0, 1);
      issueP = 0.1;
      whatsappP = 0.5;
      break;
    case 'delivery_worried':
      delivered = randInt(rng, 2, 5);
      prepaid = randInt(rng, 0, 1);
      offer = rangeWithNoise(rng, 0.1, 0.4, 0.05, 0, 1);
      issueP = 0.7;
      whatsappP = 0.8;
      break;
    case 'cash_only':
    default:
      delivered = randInt(rng, 1, 5);
      prepaid = 0;
      offer = rangeWithNoise(rng, 0.0, 0.1, 0.05, 0, 1);
      issueP = 0.15;
      whatsappP = 0.25;
      break;
  }
  // ±1 noise on order counts so types overlap
  delivered = Math.max(1, delivered + randInt(rng, -1, 1));
  prepaid = Math.min(prepaid, delivered);
  const tier = cityTier(rng);
  const issue = bernoulli(rng, issueP);
  const rtoP = codRtoRate({ city_tier: tier, past_delivery_issue: issue, delivered_orders: delivered });
  let rto = 0;
  for (let i = 0; i < delivered; i++) if (bernoulli(rng, rtoP * 0.6)) rto++;
  rto = Math.min(rto, 3);
  const total = delivered + rto;
  return {
    city_tier: tier,
    total_orders: total,
    delivered_orders: delivered,
    rto_count: rto,
    cod_orders: total - prepaid,
    prepaid_orders: prepaid,
    last_category: CATEGORIES[randInt(rng, 0, CATEGORIES.length - 1)],
    past_offer_response_rate: Math.round(offer * 100) / 100,
    past_delivery_issue: issue,
    preferred_channel: bernoulli(rng, whatsappP) ? 'whatsapp' : 'mobile_inbox',
    days_since_last_order: randInt(rng, 7, 60),
  };
}

export function generateFirstTimeCustomer(rng: Rng): CustomerState {
  return {
    city_tier: cityTier(rng),
    total_orders: 0,
    delivered_orders: 0,
    rto_count: 0,
    cod_orders: 0,
    prepaid_orders: 0,
    last_category: CATEGORIES[randInt(rng, 0, CATEGORIES.length - 1)],
    past_offer_response_rate: 0,
    past_delivery_issue: false,
    preferred_channel: bernoulli(rng, 0.65) ? 'whatsapp' : 'mobile_inbox',
    days_since_last_order: 0,
  };
}

export function pickType(rng: Rng, shares: Record<HiddenType, number> = TYPE_SHARES): HiddenType {
  return weightedPick(rng, shares);
}

export function codShare(c: Pick<CustomerState, 'cod_orders' | 'total_orders'>): number {
  return c.total_orders > 0 ? c.cod_orders / c.total_orders : 1;
}

/** High-RTO-risk flag on visible features (decision 5). */
export function rtoRiskFlag(c: Pick<CustomerState, 'rto_count' | 'delivered_orders'>): boolean {
  if (c.rto_count >= 2) return true;
  if (c.delivered_orders > 0 && c.rto_count / c.delivered_orders >= 0.3) return true;
  return false;
}

/** COD RTO per customer: mean 0.10, ×1.4 Tier 3+, ×1.5 past delivery issue, ×0.9 per extra delivered order, floor 0.04. */
export function codRtoRate(c: { city_tier: number; past_delivery_issue: boolean; delivered_orders: number }): number {
  let r = 0.1;
  if (c.city_tier >= 3) r *= 1.4;
  if (c.past_delivery_issue) r *= 1.5;
  r *= Math.pow(0.9, Math.max(0, c.delivered_orders - 1));
  return Math.max(0.04, r);
}

export function prepaidRtoRate(viaDiscount: boolean): number {
  return viaDiscount ? 0.04 : 0.03;
}

export function cancelProb(type: HiddenType, messaged: boolean): number {
  if (!messaged) return 0.02;
  return 0.02 + (type === 'cash_only' ? 0.015 : 0.005);
}

/** True conversion probability. uNoise in [0,1) maps to ±0.05. Resend (attempt ≥ 2) runs at 60% strength. */
export function trueConversion(
  type: HiddenType,
  action: Action,
  deliveredOrders: number,
  uNoise: number,
  attempt = 1,
): number {
  let p = BASE_CONVERSION[type][action];
  if (type === 'habitual' && action === 'nudge') p *= 1 + 0.03 * (deliveredOrders - 3);
  p += (uNoise - 0.5) * 0.1;
  p = clamp(p, 0.002, 0.95);
  if (attempt >= 2 && action !== 'none') p *= 0.6;
  return p;
}

/** Per-order random draws, fixed at order creation (common random numbers across actions). */
export interface Draws {
  u_conv: number;
  u_conv2: number;
  u_cancel: number;
  u_rto: number;
  u_open: number;
  u_click: number;
  u_noise: number;
  u_time: number;
}

export function makeDraws(rng: Rng): Draws {
  return {
    u_conv: rng(),
    u_conv2: rng(),
    u_cancel: rng(),
    u_rto: rng(),
    u_open: rng(),
    u_click: rng(),
    u_noise: rng(),
    u_time: rng(),
  };
}

/** Did the customer convert under this action? */
export function converts(
  type: HiddenType,
  action: Action,
  deliveredOrders: number,
  d: Draws,
  attempt = 1,
): boolean {
  const p = trueConversion(type, action, deliveredOrders, d.u_noise, attempt);
  return (attempt >= 2 ? d.u_conv2 : d.u_conv) < p;
}

/** Cancellation among non-converters, so that the marginal cancellation rate equals K(a). */
export function cancels(type: HiddenType, messaged: boolean, pConv: number, d: Draws): boolean {
  const k = cancelProb(type, messaged);
  return d.u_cancel < Math.min(1, k / Math.max(1e-6, 1 - pConv));
}

export function returns(prepaid: boolean, viaDiscount: boolean, rc: number, d: Draws): boolean {
  return d.u_rto < (prepaid ? prepaidRtoRate(viaDiscount) : rc);
}

export interface FullOutcome {
  converted: boolean;
  via: 'organic' | 'nudge' | 'discount' | null;
  cancelled: boolean;
  final: 'delivered' | 'rto' | 'cancelled';
}

/** Full outcome for one order under one action, used by the historical pilot. */
export function simulateFull(
  type: HiddenType,
  action: Action,
  c: { delivered_orders: number; city_tier: number; past_delivery_issue: boolean },
  d: Draws,
): FullOutcome {
  const pConv = trueConversion(type, action, c.delivered_orders, d.u_noise);
  const conv = d.u_conv < pConv;
  if (conv) {
    const via = action === 'none' ? 'organic' : action;
    const rto = returns(true, action === 'discount', 0, d);
    return { converted: true, via, cancelled: false, final: rto ? 'rto' : 'delivered' };
  }
  if (cancels(type, action !== 'none', pConv, d)) {
    return { converted: false, via: null, cancelled: true, final: 'cancelled' };
  }
  const rto = returns(false, false, codRtoRate(c), d);
  return { converted: false, via: null, cancelled: false, final: rto ? 'rto' : 'delivered' };
}

/** Engagement for a send (Appendix C): converters open and click; others by channel rate. */
export function engagement(converted: boolean, channel: Channel, d: Draws): { opened: boolean; clicked: boolean } {
  if (converted) return { opened: true, clicked: true };
  const opened = d.u_open < (channel === 'whatsapp' ? 0.6 : 0.2);
  const clicked = opened && d.u_click < 0.25;
  return { opened, clicked };
}

/** Order value: lognormal centred near ₹1,074, roughly ₹300–₹3,500. */
export function orderValue(rng: Rng): number {
  const v = lognormal(rng, Math.log(1000), 0.45);
  return Math.round(clamp(v, 300, 3500));
}
