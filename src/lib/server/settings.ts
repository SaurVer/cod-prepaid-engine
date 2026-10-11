import type { Economics } from '../core/decide.ts';
import type { Db } from './db.ts';

export const MERCHANT_ID = 1;
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export interface MerchantSettings {
  merchant_id: number;
  margin: number;
  cod_fee: number;
  rto_cost: number;
  msg_cost_whatsapp: number;
  msg_cost_inbox: number;
  discount_amount: number;
  max_discount: number;
  holdout_pct: number;
  max_sends: number;
  min_gap_hours: number;
  dispatch_window_hours: number;
  active_model_version: number | null;
}

export interface SystemSettings {
  merchant_id: number;
  exploration_pct: number;
  sim_now: string;
  is_live: boolean;
  real_minutes_per_sim_day: number;
  last_real_tick: string;
  sim_started_at: string;
  seed_status: string;
}

export interface Merchant {
  id: number;
  name: string;
  brand_primary: string;
  brand_accent: string;
  tone_guide: string;
}

/** Settings snapshot frozen on each run. */
export interface SettingsSnapshot extends MerchantSettings {
  exploration_pct: number;
}

export async function getMerchant(db: Db): Promise<Merchant | null> {
  const r = await db.query<Merchant>('select * from merchants where id = $1', [MERCHANT_ID]);
  return r[0] ?? null;
}

export async function getMerchantSettings(db: Db): Promise<MerchantSettings> {
  const r = await db.query<MerchantSettings>('select * from merchant_settings where merchant_id = $1', [MERCHANT_ID]);
  return r[0];
}

export async function getSystemSettings(db: Db): Promise<SystemSettings | null> {
  const r = await db.query<SystemSettings>('select * from system_settings where id = 1');
  return r[0] ?? null;
}

export function messageCost(s: Pick<MerchantSettings, 'msg_cost_whatsapp' | 'msg_cost_inbox'>, channel: string): number {
  return channel === 'whatsapp' ? Number(s.msg_cost_whatsapp) : Number(s.msg_cost_inbox);
}

export function economicsFor(s: MerchantSettings, channel: string): Economics {
  return {
    margin: Number(s.margin),
    codFee: Number(s.cod_fee),
    rtoCost: Number(s.rto_cost),
    discountAmount: Number(s.discount_amount),
    maxDiscount: Number(s.max_discount),
    messageCost: messageCost(s, channel),
  };
}

export const DEFAULTS = {
  merchant: {
    name: 'Dewlune',
    brand_primary: '#192839',
    brand_accent: '#F4A38C',
    tone_guide: 'Warm, calm and plain-spoken. Short sentences. Friendly, never pushy. No emojis.',
  },
  settings: {
    margin: 350,
    cod_fee: 20,
    rto_cost: 400,
    msg_cost_whatsapp: 1,
    msg_cost_inbox: 0,
    discount_amount: 50,
    max_discount: 50,
    holdout_pct: 0.1,
    max_sends: 2,
    min_gap_hours: 12,
    dispatch_window_hours: 24,
  },
  exploration_pct: 0.1,
  real_minutes_per_sim_day: 10,
  /** Days of seeded history shown on the dashboard (including today). */
  history_days: 30,
  /** Hour (IST) when the historical daily campaign ran. */
  history_campaign_hour: 21,
};

// ---------- Indian Standard Time helpers (all dates on screen are IST) ----------
export const IST_OFFSET_MS = 5.5 * HOUR;

/** IST calendar date (YYYY-MM-DD) for a UTC instant. */
export function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 IST on a given IST date. */
export function istDayStart(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Share of a day's orders that arrive by each IST hour: quiet at night, peaks at lunch and evening. */
const HOURLY = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1, 2, 3, 4, 5, 6, 6, 5.5, 5, 4.5, 4.5, 5, 6, 7, 7.5, 6.5, 4, 2];
const HOURLY_TOTAL = HOURLY.reduce((a, b) => a + b, 0);

/** Cumulative share (0..1) of the day's orders placed by `msIntoDay`. */
export function dayCurve(msIntoDay: number): number {
  const h = Math.max(0, Math.min(24, msIntoDay / HOUR));
  let acc = 0;
  for (let i = 0; i < 24; i++) {
    if (h >= i + 1) acc += HOURLY[i];
    else {
      acc += HOURLY[i] * (h - i);
      break;
    }
  }
  return acc / HOURLY_TOTAL;
}

/** Inverse of dayCurve: ms into the day by which a share `q` of orders has arrived. */
export function dayCurveInverse(q: number): number {
  let target = Math.max(0, Math.min(1, q)) * HOURLY_TOTAL;
  for (let i = 0; i < 24; i++) {
    if (target <= HOURLY[i]) return (i + target / HOURLY[i]) * HOUR;
    target -= HOURLY[i];
  }
  return 24 * HOUR;
}

export async function audit(
  db: Db,
  role: string,
  action: string,
  target: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await db.query(
    `insert into audit_log (merchant_id, role, action, target, before, after, at)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, (select sim_now from system_settings where id = 1))`,
    [MERCHANT_ID, role, action, target, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  );
}

export async function notify(db: Db, type: string, message: string, link: string | null): Promise<void> {
  await db.query(
    `insert into notifications (merchant_id, type, message, link, created_at)
     values ($1, $2, $3, $4, (select sim_now from system_settings where id = 1))`,
    [MERCHANT_ID, type, message, link],
  );
}

export function orderCode(id: number | string): string {
  return `DL-${String(id).padStart(6, '0')}`;
}

// ---------- Settings page ----------

export const EDITABLE_SETTINGS = [
  'margin', 'cod_fee', 'rto_cost', 'msg_cost_whatsapp', 'msg_cost_inbox', 'discount_amount', 'max_discount',
  'holdout_pct', 'max_sends', 'min_gap_hours',
] as const;

export async function saveSettings(db: Db, role: string, patch: Record<string, unknown>) {
  const before = await getMerchantSettings(db);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of EDITABLE_SETTINGS) {
    if (patch[k] === undefined || patch[k] === '') continue;
    const v = Number(patch[k]);
    if (!Number.isFinite(v) || v < 0) continue;
    vals.push(v);
    sets.push(`${k} = $${vals.length}`);
  }
  if (sets.length) await db.query(`update merchant_settings set ${sets.join(', ')}, updated_at = now() where merchant_id = 1`, vals);
  if (typeof patch.tone_guide === 'string' || typeof patch.name === 'string') {
    await db.query(`update merchants set name = coalesce($1, name), tone_guide = coalesce($2, tone_guide) where id = 1`, [
      typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : null,
      typeof patch.tone_guide === 'string' && patch.tone_guide.trim() ? patch.tone_guide.trim() : null,
    ]);
  }
  const after = await getMerchantSettings(db);
  await audit(db, role, 'settings_change', 'merchant_settings', before, after);
  return after;
}

export async function setIntegration(db: Db, role: string, key: string, consent: boolean) {
  await db.query(
    `update integrations set consent = $2, connected = $2, connected_at = case when $2 then now() else connected_at end where key = $1`,
    [key, consent],
  );
  await audit(db, role, consent ? 'integration_connect' : 'integration_disconnect', `integration:${key}`, null, { consent });
}
