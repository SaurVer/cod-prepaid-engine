// Step 1 model: 8 small logistic regressions (Appendix F). Pure TypeScript, no dependencies.

import type { Action, ActionProbs, Probs } from './decide.ts';

export const FEATURE_NAMES = [
  'delivered_orders',
  'rto_count',
  'cod_share',
  'past_offer_response_rate',
  'past_delivery_issue',
  'days_since_last_order',
  'order_value',
  'city_tier',
  'channel_whatsapp',
] as const;

/** Visible features as stored on the order at the time it was placed. */
export interface FeatureSnapshot {
  delivered_orders: number;
  rto_count: number;
  cod_share: number;
  past_offer_response_rate: number;
  past_delivery_issue: boolean;
  days_since_last_order: number;
  order_value: number;
  city_tier: number;
  channel: 'whatsapp' | 'mobile_inbox';
}

export function toVector(f: FeatureSnapshot): number[] {
  return [
    f.delivered_orders,
    f.rto_count,
    f.cod_share,
    f.past_offer_response_rate,
    f.past_delivery_issue ? 1 : 0,
    f.days_since_last_order,
    f.order_value,
    f.city_tier,
    f.channel === 'whatsapp' ? 1 : 0,
  ];
}

export interface Scaler {
  mean: number[];
  std: number[];
}

export interface LR {
  weights: number[];
  bias: number;
}

export interface ModelBundle {
  features: string[];
  scaler: Scaler;
  conv: Record<Action, LR>;
  cancel: Record<Action, LR>;
  /** RTO if COD: one model, same value for all actions */
  rtoCod: LR;
  /** RTO if prepaid: base features + converted_via_discount flag (last weight) */
  rtoPre: LR;
}

export function fitScaler(X: number[][]): Scaler {
  const n = X.length;
  const d = X[0]?.length ?? FEATURE_NAMES.length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mean[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1;
  return { mean, std };
}

export function scale(x: number[], s: Scaler): number[] {
  return x.map((v, j) => (v - s.mean[j]) / s.std[j]);
}

export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

export function predictLR(m: LR, xs: number[]): number {
  let z = m.bias;
  for (let j = 0; j < m.weights.length; j++) z += m.weights[j] * xs[j];
  return sigmoid(z);
}

export interface TrainOptions {
  iterations?: number;
  learningRate?: number;
  l2?: number;
}

/** Full-batch gradient descent on already-scaled features. */
export function trainLR(Xs: number[][], y: number[], opts: TrainOptions = {}): LR {
  const iters = opts.iterations ?? 300;
  const lr = opts.learningRate ?? 0.5;
  const l2 = opts.l2 ?? 0.01;
  const n = Xs.length;
  const d = Xs[0]?.length ?? 0;
  const w = new Array(d).fill(0);
  // Start the bias at the base-rate log-odds so rare outcomes converge quickly.
  const rate = Math.min(0.999, Math.max(0.001, y.reduce((s, v) => s + v, 0) / Math.max(1, n)));
  let b = Math.log(rate / (1 - rate));
  if (n === 0) return { weights: w, bias: b };
  const gw = new Array(d);
  for (let it = 0; it < iters; it++) {
    gw.fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const x = Xs[i];
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * x[j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * x[j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
    b -= lr * (gb / n);
  }
  return { weights: w, bias: b };
}

/** AUC via the rank-sum (Mann–Whitney) statistic. Returns null if a class is missing. */
export function auc(scores: number[], labels: number[]): number | null {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  let pos = 0;
  let neg = 0;
  for (const l of labels) (l ? pos++ : neg++);
  if (pos === 0 || neg === 0) return null;
  let rankSum = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (labels[idx[k]]) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/** One randomised training row (holdout, exploration or pilot). */
export interface TrainingRow {
  order_id: number;
  /** Sim time the order was placed (for the time-based split) */
  t: number;
  x: number[];
  action: Action;
  converted: boolean;
  cancelled: boolean;
  /** Final outcome */
  final: 'delivered' | 'rto' | 'cancelled';
  viaDiscount: boolean;
}

export const MODEL_KEYS = [
  'conv_none',
  'conv_nudge',
  'conv_discount',
  'cancel_none',
  'cancel_nudge',
  'cancel_discount',
  'rto_cod',
  'rto_pre',
] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export const MODEL_LABELS: Record<ModelKey, string> = {
  conv_none: 'Conversion · none',
  conv_nudge: 'Conversion · nudge',
  conv_discount: 'Conversion · discount',
  cancel_none: 'Cancellation · none',
  cancel_nudge: 'Cancellation · nudge',
  cancel_discount: 'Cancellation · discount',
  rto_cod: 'RTO if COD',
  rto_pre: 'RTO if prepaid',
};

/** Rows and labels for one of the 8 models. Inputs already scaled. */
export function datasetFor(key: ModelKey, rows: TrainingRow[], s: Scaler): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (const r of rows) {
    const xs = scale(r.x, s);
    if (key.startsWith('conv_') || key.startsWith('cancel_')) {
      const a = key.split('_')[1] as Action;
      if (r.action !== a) continue;
      X.push(xs);
      y.push(key.startsWith('conv_') ? (r.converted ? 1 : 0) : r.cancelled ? 1 : 0);
    } else if (key === 'rto_cod') {
      if (r.converted || r.final === 'cancelled') continue;
      X.push(xs);
      y.push(r.final === 'rto' ? 1 : 0);
    } else {
      if (!r.converted) continue;
      X.push([...xs, r.viaDiscount ? 1 : 0]);
      y.push(r.final === 'rto' ? 1 : 0);
    }
  }
  return { X, y };
}

/** 80/20 split by time; the latest 20% is validation. */
export function splitByTime(rows: TrainingRow[]): { train: TrainingRow[]; valid: TrainingRow[] } {
  const sorted = rows.slice().sort((a, b) => a.t - b.t || a.order_id - b.order_id);
  const cut = Math.floor(sorted.length * 0.8);
  return { train: sorted.slice(0, cut), valid: sorted.slice(cut) };
}

export function predictAll(m: ModelBundle, raw: number[]): Probs {
  const xs = scale(raw, m.scaler);
  const rc = predictLR(m.rtoCod, xs);
  const one = (a: Action): ActionProbs => {
    let p = predictLR(m.conv[a], xs);
    let k = predictLR(m.cancel[a], xs);
    // keep π's valid: P + K ≤ 1
    if (p + k > 0.999) {
      const s = 0.999 / (p + k);
      p *= s;
      k *= s;
    }
    return { p, k, rc, rp: predictLR(m.rtoPre, [...xs, a === 'discount' ? 1 : 0]) };
  };
  return { none: one('none'), nudge: one('nudge'), discount: one('discount') };
}

export interface ModelMetrics {
  train_rows: number;
  valid_rows: number;
  auc: Record<ModelKey, number | null>;
  /** predicted vs actual conversion rate per action, on validation data */
  conversion: Record<Action, { n: number; predicted: number; actual: number }>;
}

export function evaluate(m: ModelBundle, valid: TrainingRow[], trainRows: number): ModelMetrics {
  const aucs = {} as Record<ModelKey, number | null>;
  for (const key of MODEL_KEYS) {
    const { X, y } = datasetFor(key, valid, m.scaler);
    const lr = lrFor(m, key);
    aucs[key] = auc(
      X.map((x) => predictLR(lr, x)),
      y,
    );
  }
  const conversion = {} as ModelMetrics['conversion'];
  for (const a of ['none', 'nudge', 'discount'] as Action[]) {
    const rs = valid.filter((r) => r.action === a);
    const pred = rs.reduce((s, r) => s + predictLR(m.conv[a], scale(r.x, m.scaler)), 0);
    const act = rs.reduce((s, r) => s + (r.converted ? 1 : 0), 0);
    conversion[a] = { n: rs.length, predicted: rs.length ? pred / rs.length : 0, actual: rs.length ? act / rs.length : 0 };
  }
  return { train_rows: trainRows, valid_rows: valid.length, auc: aucs, conversion };
}

export function lrFor(m: ModelBundle, key: ModelKey): LR {
  switch (key) {
    case 'conv_none':
      return m.conv.none;
    case 'conv_nudge':
      return m.conv.nudge;
    case 'conv_discount':
      return m.conv.discount;
    case 'cancel_none':
      return m.cancel.none;
    case 'cancel_nudge':
      return m.cancel.nudge;
    case 'cancel_discount':
      return m.cancel.discount;
    case 'rto_cod':
      return m.rtoCod;
    case 'rto_pre':
      return m.rtoPre;
  }
}

export function setLR(m: Partial<ModelBundle>, key: ModelKey, lr: LR): void {
  if (key.startsWith('conv_')) {
    m.conv = { ...(m.conv ?? ({} as Record<Action, LR>)), [key.split('_')[1]]: lr } as Record<Action, LR>;
  } else if (key.startsWith('cancel_')) {
    m.cancel = { ...(m.cancel ?? ({} as Record<Action, LR>)), [key.split('_')[1]]: lr } as Record<Action, LR>;
  } else if (key === 'rto_cod') m.rtoCod = lr;
  else m.rtoPre = lr;
}

/** Train one of the 8 models on the training split. */
export function trainOne(key: ModelKey, train: TrainingRow[], s: Scaler, opts?: TrainOptions): LR {
  const { X, y } = datasetFor(key, train, s);
  return trainLR(X, y, opts);
}

/** Convenience: full training in one call (tests and seed). */
export function trainBundle(rows: TrainingRow[], opts?: TrainOptions): { bundle: ModelBundle; metrics: ModelMetrics } {
  const { train, valid } = splitByTime(rows);
  const scaler = fitScaler(train.map((r) => r.x));
  const partial: Partial<ModelBundle> = { features: [...FEATURE_NAMES], scaler };
  for (const key of MODEL_KEYS) setLR(partial, key, trainOne(key, train, scaler, opts));
  const bundle = partial as ModelBundle;
  return { bundle, metrics: evaluate(bundle, valid, train.length) };
}
