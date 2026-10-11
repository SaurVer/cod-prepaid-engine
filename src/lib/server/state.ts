import type { Db } from './db.ts';
import { campaignHref, campaignName } from './pipeline.ts';

export interface ActiveCampaign {
  id: number;
  name: string;
  href: string;
  status: string;
  progress: number;
  eta_seconds: number | null;
  order_count: number;
}

export interface AppState {
  seeded: boolean;
  seed_status: string | null;
  last_synced: string | null;
  merchant: { name: string } | null;
  active_runs: ActiveCampaign[];
  notifications: { id: number; type: string; message: string; link: string | null; read: boolean; created_real_at: string }[];
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
    last_synced: sys?.last_real_tick ?? null,
    merchant: merchant ?? null,
    active_runs: [],
    notifications: [],
    unread: 0,
    model_version: null,
    role,
  };
  if (!base.seeded) return base;
  const runs = await db.query(
    `select id, status, progress, eta_seconds, order_count, created_at, source_batch_ids from runs
     where not is_pilot and status in ('queued', 'scoring', 'deciding', 'drafting') order by id`,
  );
  const notes = await db.query(
    `select id, type, message, link, read, created_real_at from notifications order by id desc limit 15`,
  );
  const [{ unread }] = await db.query(`select count(*)::int as unread from notifications where not read`);
  const [ms] = await db.query(`select active_model_version from merchant_settings limit 1`);
  return {
    ...base,
    active_runs: runs.map((r) => ({
      id: Number(r.id),
      name: campaignName(r.created_at),
      href: campaignHref(r.source_batch_ids?.[0], Number(r.id)),
      status: r.status,
      progress: Number(r.progress),
      eta_seconds: r.eta_seconds,
      order_count: Number(r.order_count),
    })),
    notifications: notes.map((n) => ({ ...n, id: Number(n.id) })),
    unread: Number(unread),
    model_version: ms?.active_model_version ?? null,
  };
}
