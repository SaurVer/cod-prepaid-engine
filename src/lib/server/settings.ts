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
    name: 'Verdant Daily',
    brand_primary: '#2F6B4F',
    brand_accent: '#E8F1EC',
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
  /** First live sim day; the 30-day pilot covers the days before it. */
  sim_start_date: '2026-10-12',
  sim_start_hour: 6,
};

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
  return `VD-${String(id).padStart(6, '0')}`;
}

export function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
