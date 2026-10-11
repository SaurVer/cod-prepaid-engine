// Model storage and training-data assembly. Training uses randomised outcomes only:
// holdout + exploration + the seeded pilot (pilot rows are tagged holdout/explore in run 0).

import type { Action } from '../core/decide.ts';
import { type ModelBundle, type ModelMetrics, type TrainingRow, toVector, trainBundle } from '../core/model.ts';
import type { Db } from './db.ts';
import { MERCHANT_ID } from './settings.ts';

export async function trainingRows(db: Db): Promise<TrainingRow[]> {
  const rows = await db.query(
    `select o.id, o.placed_at, o.features, d.chosen_action, o.converted_at, o.converted_via, o.final_outcome
     from run_orders ro
     join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     join orders o on o.id = ro.order_id
     where ro.assignment_group in ('holdout', 'explore') and o.final_outcome is not null`,
  );
  return rows.map((r) => ({
    order_id: Number(r.id),
    t: Date.parse(r.placed_at),
    x: toVector(r.features),
    action: r.chosen_action as Action,
    converted: r.converted_at != null,
    cancelled: r.final_outcome === 'cancelled',
    final: r.final_outcome,
    viaDiscount: r.converted_via === 'discount',
  }));
}

export async function countNewRandomisedOutcomes(db: Db): Promise<number> {
  const [r] = await db.query(
    `select count(*)::int as n from run_orders ro join orders o on o.id = ro.order_id
     where ro.assignment_group in ('holdout', 'explore') and o.final_outcome is not null and o.used_in_training_version is null`,
  );
  return Number(r.n);
}

export async function trainAndStore(
  db: Db,
  opts: { version: number; activate: boolean; simAt?: number },
): Promise<{ version: number; training_rows: number; metrics: ModelMetrics }> {
  const rows = await trainingRows(db);
  const { bundle, metrics } = trainBundle(rows);
  const trainedAt = opts.simAt
    ? new Date(opts.simAt).toISOString()
    : (await db.query(`select sim_now from system_settings where id = 1`))[0].sim_now;
  await db.query(
    `insert into model_versions (version, merchant_id, trained_at, training_rows, metrics, weights, status, promoted_at)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
    [
      opts.version,
      MERCHANT_ID,
      trainedAt,
      metrics.train_rows,
      JSON.stringify(metrics),
      JSON.stringify(bundle),
      opts.activate ? 'active' : 'candidate',
      opts.activate ? trainedAt : null,
    ],
  );
  // mark which orders fed this version (training + validation split)
  const used = rows.map((r) => r.order_id);
  for (let i = 0; i < used.length; i += 10000) {
    await db.query(
      `update orders set used_in_training_version = $1 where id = any($2::bigint[]) and used_in_training_version is null`,
      [opts.version, used.slice(i, i + 10000)],
    );
  }
  if (opts.activate) {
    await db.query(`update merchant_settings set active_model_version = $1 where merchant_id = $2`, [opts.version, MERCHANT_ID]);
  }
  return { version: opts.version, training_rows: metrics.train_rows, metrics };
}

const cache = new Map<number, ModelBundle>();

export function clearModelCache(): void {
  cache.clear();
}

export async function loadModel(db: Db, version: number): Promise<ModelBundle> {
  const hit = cache.get(version);
  if (hit) return hit;
  const [r] = await db.query(`select weights from model_versions where version = $1`, [version]);
  if (!r) throw new Error(`Model v${version} not found`);
  cache.set(version, r.weights as ModelBundle);
  return r.weights as ModelBundle;
}
