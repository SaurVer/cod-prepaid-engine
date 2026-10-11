import type { Db } from './db.ts';

export interface AppState {
  seeded: boolean;
  seed_status: string | null;
  sim_now: string | null;
  is_live: boolean;
  minutes_per_day: number;
  merchant: { name: string } | null;
  latest_batch: { id: string; arrived_at: string; total_orders: number; eligible_orders: number } | null;
  active_runs: { id: number; status: string; progress: number; eta_seconds: number | null; order_count: number }[];
  notifications: { id: number; type: string; message: string; link: string | null; read: boolean; created_at: string }[];
  unread: number;
  model_version: number | null;
  role: string;
}

export async function getAppState(db: Db, role: string): Promise<AppState> {
  const [sys] = await db.query(`select * from system_settings where id = 1`);
  const [merchant] = await db.query(`select name from merchants limit 1`);
  const base: AppState = {
    seeded: Boolean(sys && sys.seed_status === 'ready'),
    seed_status: sys?.seed_status ?? null,
    sim_now: sys?.sim_now ?? null,
    is_live: Boolean(sys?.is_live),
    minutes_per_day: Number(sys?.real_minutes_per_sim_day ?? 10),
    merchant: merchant ?? null,
    latest_batch: null,
    active_runs: [],
    notifications: [],
    unread: 0,
    model_version: null,
    role,
  };
  if (!base.seeded) return base;
  const [batch] = await db.query(
    `select id, arrived_at, total_orders, eligible_orders from order_batches where not is_pilot order by sim_date desc limit 1`,
  );
  const runs = await db.query(
    `select id, status, progress, eta_seconds, order_count from runs
     where not is_pilot and status in ('queued', 'scoring', 'deciding', 'drafting') order by id`,
  );
  const notes = await db.query(`select id, type, message, link, read, created_at from notifications order by id desc limit 15`);
  const [{ unread }] = await db.query(`select count(*)::int as unread from notifications where not read`);
  const [ms] = await db.query(`select active_model_version from merchant_settings limit 1`);
  return {
    ...base,
    latest_batch: batch ?? null,
    active_runs: runs.map((r) => ({ ...r, id: Number(r.id), progress: Number(r.progress) })),
    notifications: notes.map((n) => ({ ...n, id: Number(n.id) })),
    unread: Number(unread),
    model_version: ms?.active_model_version ?? null,
  };
}
