// Model storage and training-data assembly. Training uses randomised outcomes only:
// holdout + exploration + the seeded pilot (pilot rows are tagged holdout/explore in run 0).

import type { Action } from '../core/decide.ts';
import { type ModelBundle, type ModelMetrics, type TrainingRow, toVector, trainBundle } from '../core/model.ts';
import type { Db } from './db.ts';
import { MERCHANT_ID, audit, notify } from './settings.ts';
import { FEATURE_NAMES, MODEL_KEYS, auc as aucOf, evaluate, fitScaler, setLR, splitByTime, trainOne } from '../core/model.ts';
import { UserError } from './errors.ts';

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

// ---------- Model page: versions, daily diagnostics, retrain (chunked) and promote ----------


export async function modelVersions(db: Db) {
  return db.query(
    `select version, status, trained_at, trained_real_at, training_rows, metrics, promoted_at from model_versions order by version desc`,
  );
}

export interface DayDiagnostic {
  run_id: number;
  date: string;
  model_version: number;
  scored: number;
  none: number;
  nudge: number;
  discount: number;
  sent: number;
  predicted_paid: number | null;
  actual_paid: number | null;
  window_closed: boolean;
  auc: number | null;
  expected_gain: number;
}

export async function dailyDiagnostics(db: Db): Promise<DayDiagnostic[]> {
  const runs = await db.query(
    `select id, source_batch_ids, model_version from runs where not is_pilot and status in ('sent', 'closed') order by id`,
  );
  if (!runs.length) return [];
  const rows = await db.query(
    `select ro.run_id, ro.assignment_group, d.chosen_action, d.gain_nudge, d.gain_discount,
       p.p_convert_none, p.p_convert_nudge, p.p_convert_discount,
       (s.id is not null) as sent, (o.converted_at is not null and o.converted_via <> 'organic') as paid, o.dispatched
     from run_orders ro
     join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     join predictions p on p.run_id = ro.run_id and p.order_id = ro.order_id
     join orders o on o.id = ro.order_id
     left join sends s on s.run_id = ro.run_id and s.order_id = ro.order_id
     where ro.run_id = any($1::int[])`,
    [runs.map((r) => Number(r.id))],
  );
  return runs.map((r) => {
    const rs = rows.filter((x) => Number(x.run_id) === Number(r.id));
    const model = rs.filter((x) => x.assignment_group === 'model');
    const sent = rs.filter((x) => x.sent);
    const pOf = (x: any) => Number(x[`p_convert_${x.chosen_action}`]);
    const closed = sent.length > 0 && sent.every((x) => x.dispatched || x.paid);
    return {
      run_id: Number(r.id),
      date: r.source_batch_ids?.[0],
      model_version: Number(r.model_version),
      scored: rs.length,
      none: model.filter((x) => x.chosen_action === 'none').length,
      nudge: model.filter((x) => x.chosen_action === 'nudge').length,
      discount: model.filter((x) => x.chosen_action === 'discount').length,
      sent: sent.length,
      predicted_paid: sent.length ? sent.reduce((a, x) => a + pOf(x), 0) / sent.length : null,
      actual_paid: sent.length ? sent.filter((x) => x.paid).length / sent.length : null,
      window_closed: closed,
      auc: closed ? aucOf(sent.map(pOf), sent.map((x) => (x.paid ? 1 : 0))) : null,
      expected_gain: model.reduce(
        (a, x) => a + (x.chosen_action === 'nudge' ? Number(x.gain_nudge) : x.chosen_action === 'discount' ? Number(x.gain_discount) : 0),
        0,
      ),
    };
  });
}

/** Start a retrain job; returns the job. One model is trained per call so progress is real. */
export async function startRetrain(db: Db, role: string) {
  const running = await db.query(`select * from training_jobs where status = 'running' order by id desc limit 1`);
  if (running.length) return running[0];
  const [{ v }] = await db.query(`select coalesce(max(version), 0) + 1 as v from model_versions`);
  const [job] = await db.query(
    `insert into training_jobs (merchant_id, version, step, total_steps, status, partial)
     values (1, $1, 0, $2, 'running', '{}'::jsonb) returning *`,
    [v, MODEL_KEYS.length + 1],
  );
  await audit(db, role, 'retrain_started', `model:v${v}`, null, null);
  return job;
}

export async function trainingStep(db: Db) {
  const [job] = await db.query(`select * from training_jobs where status = 'running' order by id desc limit 1`);
  if (!job) return { status: 'idle' };
  const rows = await trainingRows(db);
  const { train, valid } = splitByTime(rows);
  const partial: any = job.partial && Object.keys(job.partial).length ? job.partial : { scaler: fitScaler(train.map((r) => r.x)) };
  const step = Number(job.step);
  if (step < MODEL_KEYS.length) {
    const key = MODEL_KEYS[step];
    setLR(partial, key, trainOne(key, train, partial.scaler));
    await db.query(`update training_jobs set step = step + 1, partial = $2::jsonb where id = $1`, [job.id, JSON.stringify(partial)]);
    return { status: 'running', step: step + 1, total: Number(job.total_steps), trained: key };
  }
  const bundle = { ...partial, features: [...FEATURE_NAMES] };
  const metrics = evaluate(bundle, valid, train.length);
  const [{ sim_now }] = await db.query(`select sim_now from system_settings where id = 1`);
  await db.query(
    `insert into model_versions (version, merchant_id, trained_at, training_rows, metrics, weights, status)
     values ($1, 1, $2, $3, $4::jsonb, $5::jsonb, 'candidate')`,
    [job.version, sim_now, metrics.train_rows, JSON.stringify(metrics), JSON.stringify(bundle)],
  );
  const ids = rows.map((r) => r.order_id);
  for (let i = 0; i < ids.length; i += 10000) {
    await db.query(`update orders set used_in_training_version = $1 where id = any($2::bigint[]) and used_in_training_version is null`, [
      job.version,
      ids.slice(i, i + 10000),
    ]);
  }
  await db.query(`update training_jobs set step = total_steps, status = 'done' where id = $1`, [job.id]);
  await notify(db, 'model_trained', `Model v${job.version} is trained and ready to compare`, '/model');
  return { status: 'done', version: Number(job.version) };
}

export async function promoteModel(db: Db, version: number, role: string) {
  if (role !== 'owner') throw new UserError('Only the Owner can promote a model.');
  return db.tx(async (t) => {
    const [m] = await t.query(`select * from model_versions where version = $1`, [version]);
    if (!m) throw new UserError('Model not found.');
    if (m.status === 'active') return { ok: true };
    const [before] = await t.query(`select active_model_version from merchant_settings where merchant_id = 1`);
    await t.query(`update model_versions set status = 'retired' where status = 'active'`);
    await t.query(`update model_versions set status = 'active', promoted_at = (select sim_now from system_settings where id = 1) where version = $1`, [version]);
    await t.query(`update merchant_settings set active_model_version = $1 where merchant_id = 1`, [version]);
    await audit(t, role, 'promote_model', `model:v${version}`, { active: before?.active_model_version }, { active: version });
    return { ok: true };
  });
}

// ---------- Model page: training data, parameters, per-run outputs ----------

/** What the model can learn from: randomised orders (pilot, control group, random test), by source and action. */
export async function trainingDataSummary(db: Db) {
  const rows = await db.query(
    `select case when ro.run_id = 0 then 'pilot' when ro.assignment_group = 'holdout' then 'control' else 'random_test' end as source,
       d.chosen_action as action,
       count(*)::int as n,
       count(*) filter (where o.final_outcome is not null)::int as resolved,
       count(*) filter (where o.final_outcome is not null and o.converted_at is not null)::int as paid_online,
       count(*) filter (where o.final_outcome = 'cancelled')::int as cancelled,
       count(*) filter (where o.final_outcome = 'rto')::int as rto,
       count(*) filter (where o.final_outcome in ('delivered', 'rto'))::int as shipped,
       count(*) filter (where o.final_outcome is not null and o.used_in_training_version is null)::int as unused
     from run_orders ro
     join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     join orders o on o.id = ro.order_id
     where ro.assignment_group in ('holdout', 'explore')
     group by 1, 2 order by 1, 2`,
  );
  return rows.map((r) => ({
    source: r.source as 'pilot' | 'control' | 'random_test',
    action: r.action as Action,
    n: Number(r.n),
    resolved: Number(r.resolved),
    paid_online: Number(r.paid_online),
    cancelled: Number(r.cancelled),
    rto: Number(r.rto),
    shipped: Number(r.shipped),
    unused: Number(r.unused),
  }));
}

/** A few recent training rows exactly as the model sees them: inputs, the action, and the outcome labels. */
export async function trainingSample(db: Db, limit = 12) {
  return db.query(
    `select o.id, o.placed_at, o.features, d.chosen_action, ro.run_id, ro.assignment_group,
       o.converted_at is not null as paid_online, o.converted_via, o.final_outcome, o.used_in_training_version
     from run_orders ro
     join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     join orders o on o.id = ro.order_id
     where ro.assignment_group in ('holdout', 'explore') and o.final_outcome is not null
     order by o.placed_at desc, o.id desc limit $1`,
    [limit],
  );
}

/** Per-order model outputs for one campaign: the predictions, expected profit per action and the decision. */
export async function runModelOutputs(
  db: Db,
  runId: number,
  opts: { page?: number; group?: string; action?: string; pageSize?: number } = {},
) {
  const [run] = await db.query(`select * from runs where id = $1 and not is_pilot`, [runId]);
  if (!run) return null;
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const where = ['ro.run_id = $1'];
  const params: unknown[] = [runId];
  if (opts.group && ['model', 'holdout', 'explore'].includes(opts.group)) {
    params.push(opts.group);
    where.push(`ro.assignment_group = $${params.length}::assignment_group`);
  }
  if (opts.action && ['none', 'nudge', 'discount'].includes(opts.action)) {
    params.push(opts.action);
    where.push(`d.chosen_action = $${params.length}::action_type`);
  }
  const base = `from run_orders ro
     join predictions p on p.run_id = ro.run_id and p.order_id = ro.order_id
     join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     join orders o on o.id = ro.order_id
     where ${where.join(' and ')}`;
  const [{ total }] = await db.query(`select count(*)::int as total ${base}`, params);
  const rows = await db.query(
    `select ro.order_id, ro.assignment_group, o.value, o.features,
       p.p_convert_none, p.p_convert_nudge, p.p_convert_discount, p.p_cancel_none, p.p_cancel_nudge, p.p_cancel_discount,
       p.r_cod_none, p.r_pre_none, p.r_pre_discount,
       d.ev_none, d.ev_nudge, d.ev_discount, d.gain_nudge, d.gain_discount, d.chosen_action, d.reason_code,
       o.converted_at is not null as paid_online, o.converted_via, o.final_outcome
     ${base}
     order by greatest(d.gain_nudge, d.gain_discount) desc, ro.order_id
     limit ${pageSize} offset ${(page - 1) * pageSize}`,
    params,
  );
  const [agg] = await db.query(
    `select count(*)::int as n,
       avg(p.p_convert_none) as p_none, avg(p.p_convert_nudge) as p_nudge, avg(p.p_convert_discount) as p_discount,
       avg(p.p_cancel_none) as k_none, avg(p.p_cancel_nudge) as k_nudge, avg(p.p_cancel_discount) as k_discount,
       avg(p.r_cod_none) as rc, avg(p.r_pre_none) as rp_nudge, avg(p.r_pre_discount) as rp_discount,
       avg(d.ev_none) as ev_none, avg(d.ev_nudge) as ev_nudge, avg(d.ev_discount) as ev_discount,
       sum(case when ro.assignment_group = 'model' and d.chosen_action = 'nudge' then d.gain_nudge
                when ro.assignment_group = 'model' and d.chosen_action = 'discount' then d.gain_discount else 0 end) as expected_gain,
       count(*) filter (where ro.assignment_group = 'model' and d.chosen_action = 'none')::int as ai_none,
       count(*) filter (where ro.assignment_group = 'model' and d.chosen_action = 'nudge')::int as ai_nudge,
       count(*) filter (where ro.assignment_group = 'model' and d.chosen_action = 'discount')::int as ai_discount,
       count(*) filter (where ro.assignment_group = 'holdout')::int as control,
       count(*) filter (where ro.assignment_group = 'explore')::int as random_test
     from run_orders ro
     join predictions p on p.run_id = ro.run_id and p.order_id = ro.order_id
     join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     where ro.run_id = $1`,
    [runId],
  );
  const num = (x: unknown) => (x == null ? null : Number(x));
  return {
    run,
    total: Number(total),
    page,
    pageSize,
    rows,
    agg: Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, num(v)])) as Record<string, number | null>,
  };
}
