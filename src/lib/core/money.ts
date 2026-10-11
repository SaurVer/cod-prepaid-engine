// Realised net ₹ for one resolved order, using the same payoffs as the EV formula (section 5).

export interface MoneySettings {
  margin: number;
  codFee: number;
  rtoCost: number;
}

export interface ResolvedOrder {
  converted: boolean;
  /** discount actually paid (0 unless converted via a discount link) */
  discountPaid: number;
  final: 'delivered' | 'rto' | 'cancelled';
  /** total message cost actually incurred (all sends) */
  messageCost: number;
}

export function realisedValue(o: ResolvedOrder, s: MoneySettings): number {
  let v: number;
  if (o.final === 'cancelled') v = 0;
  else if (o.final === 'rto') v = -s.rtoCost;
  else if (o.converted) v = s.margin - o.discountPaid;
  else v = s.margin - s.codFee;
  return v - o.messageCost;
}

/** Mean and 95% interval for a difference of two means (Welch, normal approx). */
export function diffOfMeans(a: number[], b: number[]): { diff: number; lo: number; hi: number } | null {
  if (a.length < 2 || b.length < 2) return null;
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const varc = (x: number[], m: number) => x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1);
  const ma = mean(a);
  const mb = mean(b);
  const se = Math.sqrt(varc(a, ma) / a.length + varc(b, mb) / b.length);
  const diff = ma - mb;
  return { diff, lo: diff - 1.96 * se, hi: diff + 1.96 * se };
}
