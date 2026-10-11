// Shared generators for the historical pilot and for training-row assembly.

import type { Action } from './decide.ts';
import type { FeatureSnapshot, TrainingRow } from './model.ts';
import { toVector } from './model.ts';
import { type Rng } from './rng.ts';
import {
  type CustomerState,
  type Draws,
  type FullOutcome,
  type HiddenType,
  codShare,
  makeDraws,
  orderValue,
  simulateFull,
} from './sim.ts';

export function snapshotFor(c: CustomerState, value: number): FeatureSnapshot {
  return {
    delivered_orders: c.delivered_orders,
    rto_count: c.rto_count,
    cod_share: Math.round(codShare(c) * 1000) / 1000,
    past_offer_response_rate: c.past_offer_response_rate,
    past_delivery_issue: c.past_delivery_issue,
    days_since_last_order: c.days_since_last_order,
    order_value: value,
    city_tier: c.city_tier,
    channel: c.preferred_channel,
  };
}

export interface PilotOrder {
  features: FeatureSnapshot;
  value: number;
  action: Action;
  draws: Draws;
  outcome: FullOutcome;
}

/** One randomised pilot order: action drawn uniformly from the three actions. */
export function pilotOrder(rng: Rng, c: CustomerState, type: HiddenType): PilotOrder {
  const value = orderValue(rng);
  const r = rng();
  const action: Action = r < 1 / 3 ? 'none' : r < 2 / 3 ? 'nudge' : 'discount';
  const draws = makeDraws(rng);
  const outcome = simulateFull(type, action, c, draws);
  return { features: snapshotFor(c, value), value, action, draws, outcome };
}

export function toTrainingRow(id: number, t: number, f: FeatureSnapshot, action: Action, o: FullOutcome): TrainingRow {
  return {
    order_id: id,
    t,
    x: toVector(f),
    action,
    converted: o.converted,
    cancelled: o.final === 'cancelled',
    final: o.final,
    viaDiscount: o.via === 'discount',
  };
}
