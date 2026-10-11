// Results, Overview figures and the Inspector. Every number here is computed from stored rows.

import { realisedValue } from '../core/money.ts';
import type { Db } from './db.ts';
import { type SettingsSnapshot, getMerchantSettings } from './settings.ts';

export interface GroupStats {
  n: number;
  converted: number;
  conversion_rate: number;
  resolved: number;
  cancelled: number;
  cancel_rate: number | null;
  rto: number;
  rto_rate: number | null;
  realised_total: number;
  realised_per_order: number | null;
}

function groupStats(rows: any[], snap: SettingsSnapshot): GroupStats {
  const s = { margin: Number(snap.margin), codFee: Number(snap.cod_fee), rtoCost: Number(snap.rto_cost) };
  const resolved = rows.filter((r) => r.final_outcome);
  const shipped = resolved.filter((r) => r.final_outcome !== 'cancelled');
  const values = resolved.map((r) =>
    realisedValue(
      {
        converted: r.converted_at != null,
        discountPaid: Number(r.discount_paid),
        final: r.final_outcome,
        messageCost: Number(r.message_cost),
      },
      s,
    ),
  );
  const total = values.reduce((a, b) => a + b, 0);
  const converted = rows.filter((r) => r.converted_at != null).length;
  const cancelled = resolved.filter((r) => r.final_outcome === 'cancelled').length;
  const rto = shipped.filter((r) => r.final_outcome === 'rto').length;
  return {
    n: rows.length,
    converted,
    conversion_rate: rows.length ? converted / rows.length : 0,
    resolved: resolved.length,
    cancelled,
    cancel_rate: resolved.length ? cancelled / resolved.length : null,
    rto,
    rto_rate: shipped.length ? rto / shipped.length : null,
    realised_total: total,
    realised_per_order: resolved.length ? total / resolved.length : null,
  };
}

export async function runResults(db: Db, runId: number) {
  const [run] = await db.query(`select * from runs where id = $1`, [runId]);
  if (!run) return null;
  const snap = run.settings_snapshot as SettingsSnapshot;
  const rows = await db.query(
    `select ro.order_id, ro.assignment_group, d.chosen_action, d.gain_nudge, d.gain_discount,
       o.converted_at, o.converted_via, o.discount_paid, o.message_cost, o.final_outcome, o.send_count, o.dispatched
     from run_orders ro
     join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     join orders o on o.id = ro.order_id
     where ro.run_id = $1`,
    [runId],
  );
  const [funnel] = await db.query(
    `select count(distinct s.id)::int as sent,
       count(distinct e.send_id) filter (where e.type = 'delivered')::int as delivered,
       count(distinct e.send_id) filter (where e.type = 'opened')::int as opened,
       count(distinct e.send_id) filter (where e.type = 'clicked')::int as clicked,
       count(distinct e.send_id) filter (where e.type = 'converted')::int as converted,
       min(s.sent_at) as sent_at
     from sends s left join events e on e.send_id = s.id
     where s.run_id = $1`,
    [runId],
  );
  const sentIds = new Set(
    (await db.query(`select order_id from sends where run_id = $1`, [runId])).map((r) => Number(r.order_id)),
  );
  const gainOf = (r: any) =>
    r.chosen_action === 'nudge' ? Number(r.gain_nudge) : r.chosen_action === 'discount' ? Number(r.gain_discount) : 0;
  const estimatedSent = rows.filter((r) => sentIds.has(Number(r.order_id))).reduce((s, r) => s + gainOf(r), 0);
  const estimatedModel = rows.filter((r) => r.assignment_group === 'model').reduce((s, r) => s + gainOf(r), 0);

  const model = groupStats(rows.filter((r) => r.assignment_group === 'model'), snap);
  const holdout = groupStats(rows.filter((r) => r.assignment_group === 'holdout'), snap);
  const explore = groupStats(rows.filter((r) => r.assignment_group === 'explore'), snap);
  const fullyResolved = model.n > 0 && holdout.n > 0 && model.resolved === model.n && holdout.resolved === holdout.n;
  const incremental =
    fullyResolved && model.realised_per_order != null && holdout.realised_per_order != null
      ? model.realised_per_order - holdout.realised_per_order
      : null;
  const resolvedShare = model.n + holdout.n ? (model.resolved + holdout.resolved) / (model.n + holdout.n) : 0;
  return {
    run,
    funnel: {
      sent: funnel.sent,
      delivered: funnel.delivered,
      opened: funnel.opened,
      clicked: funnel.clicked,
      ctr: funnel.delivered ? funnel.clicked / funnel.delivered : null,
      converted: funnel.converted,
      sent_at: funnel.sent_at,
    },
    estimated_gain_sent: estimatedSent,
    estimated_gain_model: estimatedModel,
    groups: { model, holdout, explore },
    incremental_per_order: incremental,
    realised_gain: incremental == null ? null : incremental * model.n,
    resolved_share: resolvedShare,
    actions: {
      none: rows.filter((r) => r.assignment_group === 'model' && r.chosen_action === 'none').length,
      nudge: rows.filter((r) => r.assignment_group === 'model' && r.chosen_action === 'nudge').length,
      discount: rows.filter((r) => r.assignment_group === 'model' && r.chosen_action === 'discount').length,
    },
  };
}

export type RunResults = NonNullable<Awaited<ReturnType<typeof runResults>>>;

/** Historical COD vs prepaid RTO rates from resolved eligible orders in the last 30 sim days. */
export async function rtoRates(db: Db) {
  const [r] = await db.query(
    `select
       count(*) filter (where o.converted_at is null and o.final_outcome = 'rto')::int as cod_rto,
       count(*) filter (where o.converted_at is null and o.final_outcome in ('rto', 'delivered'))::int as cod_n,
       count(*) filter (where o.converted_at is not null and o.final_outcome = 'rto')::int as pre_rto,
       count(*) filter (where o.converted_at is not null and o.final_outcome in ('rto', 'delivered'))::int as pre_n
     from orders o, system_settings s
     where s.id = 1 and o.eligible and o.final_outcome is not null and o.outcome_at > s.sim_now - interval '30 days'`,
  );
  return {
    cod_rto_rate: r.cod_n ? r.cod_rto / r.cod_n : 0,
    prepaid_rto_rate: r.pre_n ? r.pre_rto / r.pre_n : 0,
    cod_n: r.cod_n,
    pre_n: r.pre_n,
  };
}

export async function overview(db: Db) {
  const batches = await db.query(
    `select id, sim_date, total_orders, cod_orders, eligible_orders, arrived_at
     from order_batches where not is_pilot order by sim_date desc limit 14`,
  );
  const today = batches[0] ?? null;
  const ms = await getMerchantSettings(db);
  const rates = await rtoRates(db);
  const codCostPerOrder = Number(ms.cod_fee) + (rates.cod_rto_rate - rates.prepaid_rto_rate) * Number(ms.rto_cost);
  let firstTime = 0;
  let prepaid = 0;
  let risk = 0;
  if (today) {
    const [c] = await db.query(
      `select count(*) filter (where payment_mode = 'prepaid')::int as prepaid,
         count(*) filter (where payment_mode = 'cod' and is_first_time)::int as first_time,
         count(*) filter (where payment_mode = 'cod' and not is_first_time and rto_risk_flag)::int as risk
       from orders where batch_id = $1`,
      [today.id],
    );
    firstTime = c.first_time;
    prepaid = c.prepaid;
    risk = c.risk;
  }
  return {
    today,
    excluded: { first_time: firstTime, prepaid, high_rto_risk: risk },
    trend: batches
      .slice()
      .reverse()
      .map((b) => ({
        date: b.sim_date,
        orders: Number(b.total_orders),
        cod_share: Number(b.total_orders) ? Number(b.cod_orders) / Number(b.total_orders) : 0,
      })),
    money: {
      eligible: today ? Number(today.eligible_orders) : 0,
      cod_cost_per_order: codCostPerOrder,
      at_stake: (today ? Number(today.eligible_orders) : 0) * codCostPerOrder,
      cod_fee: Number(ms.cod_fee),
      rto_cost: Number(ms.rto_cost),
      ...rates,
    },
  };
}

export async function inspectorOrder(db: Db, runId: number, orderId: number) {
  const [row] = await db.query(
    `select ro.*, o.id as oid, o.batch_id, o.customer_id, o.value, o.features, o.placed_at, o.dispatch_deadline,
       o.lifecycle_state, o.send_count, o.converted_at, o.converted_via, o.final_outcome, o.outcome_at,
       o.discount_paid, o.message_cost, o.used_in_training_version,
       p.model_version, p.p_convert_none, p.p_convert_nudge, p.p_convert_discount, p.p_cancel_none, p.p_cancel_nudge,
       p.p_cancel_discount, p.r_cod_none, p.r_cod_nudge, p.r_cod_discount, p.r_pre_none, p.r_pre_nudge, p.r_pre_discount,
       d.ev_none, d.ev_nudge, d.ev_discount, d.gain_nudge, d.gain_discount, d.chosen_action, d.reason_code,
       d.discount_applied, d.detail,
       m.llm_prompt, m.llm_output, m.edited_text, m.final_text, m.variant_tag, m.fallback_used, m.review, m.channel,
       r.settings_snapshot, r.model_version as run_model_version, r.status as run_status
     from run_orders ro
     join runs r on r.id = ro.run_id
     join orders o on o.id = ro.order_id
     left join predictions p on p.run_id = ro.run_id and p.order_id = ro.order_id
     left join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     left join messages m on m.run_id = ro.run_id and m.order_id = ro.order_id
     where ro.run_id = $1 and ro.order_id = $2`,
    [runId, orderId],
  );
  if (!row) return null;
  const events = await db.query(
    `select e.type, e.at, s.attempt, s.run_id from events e join sends s on s.id = e.send_id
     where e.order_id = $1 order by e.at`,
    [orderId],
  );
  const sends = await db.query(
    `select id, run_id, action, attempt, sent_at, channel, discount_applied from sends where order_id = $1 order by sent_at`,
    [orderId],
  );
  return { row, events, sends };
}

export async function runOrderIds(db: Db, runId: number, limit = 1) {
  return db.query(
    `select ro.order_id from run_orders ro join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     where ro.run_id = $1 and ro.assignment_group = 'model' and d.chosen_action = 'nudge'
     order by d.gain_nudge - d.gain_discount asc limit $2`,
    [runId, limit],
  );
}
