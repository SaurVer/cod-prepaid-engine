// Results, Overview figures and the Inspector. Every number here is computed from stored rows.

import { realisedValue } from '../core/money.ts';
import type { Db } from './db.ts';
import { type SettingsSnapshot, DEFAULTS, getMerchantSettings, istDate } from './settings.ts';

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

export interface DayCampaign {
  id: number;
  status: string;
  created_at: string;
  order_count: number;
  progress: number;
  eta_seconds: number | null;
  sent: number;
  opened: number;
  clicked: number;
  paid_online: number;
  expected_gain: number;
  extra_per_order: number | null;
  extra_total: number | null;
  resolved_share: number;
  /** average profit per resolved order, AI-decided group and control group */
  ai_profit: number | null;
  control_profit: number | null;
  ai_n: number;
  control_n: number;
  /** total profit of orders with a known outcome, and how many that is */
  ai_total: number;
  control_total: number;
  ai_resolved: number;
  control_resolved: number;
  /** estimate from the deliveries known so far (null until each group has 20 known) */
  extra_so_far: number | null;
  replay: boolean;
  holdout_pct: number;
  explore_pct: number;
}

export interface DaySummary {
  date: string;
  /** a past day: a campaign on it replays as if sent at 9 PM that evening */
  past: boolean;
  planned_total: number;
  total: number;
  cod: number;
  prepaid: number;
  eligible: number;
  /** orders a new campaign would take right now */
  ready: number;
  messaged: number;
  paid_after_msg: number;
  campaigns: DayCampaign[];
}

/**
 * Estimate while deliveries are still arriving. Cancellations are all known at dispatch but deliveries
 * trickle in, so a plain average of known orders over-weights cancellations. Instead: value of a shipped
 * order (from those known) × share not cancelled − message cost. Shown only once half of each group is known.
 */
function soFar(m: any, h: any): number | null {
  if (!m || !h || m.avg_shipped == null || h.avg_shipped == null) return null;
  if (m.resolved < 0.5 * m.n || h.resolved < 0.5 * h.n) return null;
  const per = (g: any) => Number(g.avg_shipped) * (1 - Number(g.cancelled) / Number(g.n)) - Number(g.avg_msg);
  return (per(m) - per(h)) * m.n;
}

/** Per-campaign measured extra profit vs control, computed in SQL from resolved orders. */
async function campaignStats(db: Db, runIds: number[]): Promise<Map<number, Omit<DayCampaign, 'id' | 'status' | 'created_at' | 'order_count' | 'progress' | 'eta_seconds' | 'replay' | 'holdout_pct' | 'explore_pct'>>> {
  const out = new Map();
  if (!runIds.length) return out;
  const [groups, funnel, gains] = await Promise.all([db.query(
    `select ro.run_id, ro.assignment_group as g, count(*)::int as n, count(o.final_outcome)::int as resolved,
       avg(case when o.final_outcome = 'cancelled' then 0
                when o.final_outcome = 'rto' then -(r.settings_snapshot->>'rto_cost')::numeric
                when o.converted_at is not null then (r.settings_snapshot->>'margin')::numeric - o.discount_paid
                else (r.settings_snapshot->>'margin')::numeric - (r.settings_snapshot->>'cod_fee')::numeric end
           - o.message_cost) filter (where o.final_outcome is not null) as avg_value,
       sum(case when o.final_outcome = 'cancelled' then 0
                when o.final_outcome = 'rto' then -(r.settings_snapshot->>'rto_cost')::numeric
                when o.converted_at is not null then (r.settings_snapshot->>'margin')::numeric - o.discount_paid
                else (r.settings_snapshot->>'margin')::numeric - (r.settings_snapshot->>'cod_fee')::numeric end
           - o.message_cost) filter (where o.final_outcome is not null) as total_value
     , count(*) filter (where o.final_outcome = 'cancelled')::int as cancelled,
       avg(case when o.final_outcome = 'rto' then -(r.settings_snapshot->>'rto_cost')::numeric
                when o.converted_at is not null then (r.settings_snapshot->>'margin')::numeric - o.discount_paid
                else (r.settings_snapshot->>'margin')::numeric - (r.settings_snapshot->>'cod_fee')::numeric end)
         filter (where o.final_outcome in ('delivered', 'rto')) as avg_shipped,
       avg(o.message_cost) as avg_msg
     from run_orders ro join orders o on o.id = ro.order_id join runs r on r.id = ro.run_id
     where ro.run_id = any($1::int[]) and ro.assignment_group in ('model', 'holdout')
     group by 1, 2`,
    [runIds],
  ), db.query(
    `select s.run_id, count(distinct s.id)::int as sent,
       count(distinct e.send_id) filter (where e.type = 'opened')::int as opened,
       count(distinct e.send_id) filter (where e.type = 'clicked')::int as clicked,
       count(distinct e.send_id) filter (where e.type = 'converted')::int as paid_online
     from sends s left join events e on e.send_id = s.id
     where s.run_id = any($1::int[]) group by 1`,
    [runIds],
  ), db.query(
    `select ro.run_id, coalesce(sum(case d.chosen_action when 'nudge' then d.gain_nudge when 'discount' then d.gain_discount else 0 end), 0) as g
     from run_orders ro join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     where ro.run_id = any($1::int[]) and ro.assignment_group = 'model' group by 1`,
    [runIds],
  )]);
  for (const id of runIds) {
    const m = groups.find((g) => Number(g.run_id) === id && g.g === 'model');
    const h = groups.find((g) => Number(g.run_id) === id && g.g === 'holdout');
    const f = funnel.find((x) => Number(x.run_id) === id);
    const n = (m?.n ?? 0) + (h?.n ?? 0);
    const resolved = (m?.resolved ?? 0) + (h?.resolved ?? 0);
    const full = m && h && m.resolved === m.n && h.resolved === h.n;
    const per = full && m.avg_value != null && h.avg_value != null ? Number(m.avg_value) - Number(h.avg_value) : null;
    out.set(id, {
      sent: f?.sent ?? 0,
      opened: f?.opened ?? 0,
      clicked: f?.clicked ?? 0,
      paid_online: f?.paid_online ?? 0,
      expected_gain: Number(gains.find((g) => Number(g.run_id) === id)?.g ?? 0),
      extra_per_order: per,
      extra_total: per == null ? null : per * (m?.n ?? 0),
      resolved_share: n ? resolved / n : 0,
      ai_profit: m?.avg_value == null ? null : Number(m.avg_value),
      control_profit: h?.avg_value == null ? null : Number(h.avg_value),
      ai_n: m?.n ?? 0,
      control_n: h?.n ?? 0,
      ai_total: Number(m?.total_value ?? 0),
      control_total: Number(h?.total_value ?? 0),
      ai_resolved: m?.resolved ?? 0,
      control_resolved: h?.resolved ?? 0,
      extra_so_far: soFar(m, h),
    });
  }
  return out;
}

export async function daySummaries(db: Db, limit = 30, only?: string): Promise<DaySummary[]> {
  const today = istDate(Date.now());
  const days = await db.query(
    `with b as materialized (
       select * from order_batches where not is_pilot ${only ? 'and id = $3' : ''} order by sim_date desc limit $1
     ),
     agg as (
       select o.batch_id,
         count(*) filter (where o.payment_mode = 'prepaid')::int as prepaid,
         count(*) filter (where o.eligible and o.converted_at is null and r.order_id is null and (
           case when b.id >= $2 then o.lifecycle_state = 'eligible' and not o.dispatched and o.dispatch_deadline > s.sim_now
                else o.placed_at < ((b.sim_date + time '${String(DEFAULTS.history_campaign_hour).padStart(2, '0')}:00') at time zone 'Asia/Kolkata') end))::int as ready,
         count(*) filter (where o.send_count > 0)::int as messaged,
         count(*) filter (where o.converted_via in ('nudge', 'discount'))::int as paid_after_msg
       from orders o
       join b on b.id = o.batch_id
       join system_settings s on s.id = 1
       left join run_orders r on r.order_id = o.id and r.run_id > 0
       group by o.batch_id
     )
     select b.id, b.planned_total, b.total_orders, b.cod_orders, b.eligible_orders,
       coalesce(agg.prepaid, 0) as prepaid, coalesce(agg.ready, 0) as ready,
       coalesce(agg.messaged, 0) as messaged, coalesce(agg.paid_after_msg, 0) as paid_after_msg
     from b left join agg on agg.batch_id = b.id
     order by b.sim_date desc`,
    only ? [limit, today, only] : [limit, today],
  );
  const dates = days.map((d) => d.id);
  const runs = dates.length
    ? await db.query(
        `select id, status, created_at, order_count, progress, eta_seconds, source_batch_ids, settings_snapshot from runs
         where not is_pilot and source_batch_ids && $1::text[] order by id`,
        [dates],
      )
    : [];
  const stats = await campaignStats(db, runs.map((r) => Number(r.id)));
  return days.map((d) => ({
    date: d.id,
    past: d.id < today,
    planned_total: Number(d.planned_total),
    total: Number(d.total_orders),
    cod: Number(d.cod_orders),
    prepaid: Number(d.prepaid),
    eligible: Number(d.eligible_orders),
    ready: Number(d.ready),
    messaged: Number(d.messaged),
    paid_after_msg: Number(d.paid_after_msg),
    campaigns: runs
      .filter((r) => (r.source_batch_ids ?? []).includes(d.id))
      .map((r) => ({
        id: Number(r.id),
        status: r.status,
        created_at: r.created_at,
        order_count: Number(r.order_count),
        progress: Number(r.progress),
        eta_seconds: r.eta_seconds,
        replay: Boolean(r.settings_snapshot?.replay),
        holdout_pct: Number(r.settings_snapshot?.holdout_pct ?? 0),
        explore_pct: Number(r.settings_snapshot?.exploration_pct ?? 0),
        ...stats.get(Number(r.id))!,
      })),
  }));
}

/** Every campaign ever run, newest first, with its measured result. */
export async function listCampaigns(db: Db) {
  const runs = await db.query(
    `select r.id, r.status, r.created_at, r.order_count, r.progress, r.eta_seconds, r.source_batch_ids, r.settings_snapshot,
       r.model_version, r.created_by_role, r.approved_at, r.started_real_at,
       count(ro.order_id) filter (where ro.assignment_group = 'holdout')::int as control,
       count(ro.order_id) filter (where ro.assignment_group = 'explore')::int as random_test,
       count(ro.order_id) filter (where ro.assignment_group = 'model')::int as ai
     from runs r left join run_orders ro on ro.run_id = r.id
     where not r.is_pilot group by r.id order by r.id desc`,
  );
  const stats = await campaignStats(db, runs.map((r) => Number(r.id)));
  return runs.map((r) => ({
    id: Number(r.id),
    status: r.status as string,
    created_at: r.created_at as string,
    started_real_at: r.started_real_at as string | null,
    date: (r.source_batch_ids?.[0] ?? '') as string,
    replay: Boolean(r.settings_snapshot?.replay),
    order_count: Number(r.order_count),
    progress: Number(r.progress),
    model_version: Number(r.model_version),
    role: r.created_by_role as string,
    holdout_pct: Number(r.settings_snapshot?.holdout_pct ?? 0),
    explore_pct: Number(r.settings_snapshot?.exploration_pct ?? 0),
    control: Number(r.control),
    random_test: Number(r.random_test),
    ai: Number(r.ai),
    ...stats.get(Number(r.id))!,
  }));
}
export type CampaignListRow = Awaited<ReturnType<typeof listCampaigns>>[number];

/** Inputs to work out COD cost at stake for any number of orders (done in the browser). */
export async function costInputs(db: Db) {
  const ms = await getMerchantSettings(db);
  const rates = await rtoRates(db);
  const [sys] = await db.query(`select exploration_pct from system_settings where id = 1`);
  return {
    cod_fee: Number(ms.cod_fee),
    rto_cost: Number(ms.rto_cost),
    margin: Number(ms.margin),
    discount_amount: Number(ms.discount_amount),
    holdout_pct: Number(ms.holdout_pct),
    exploration_pct: Number(sys?.exploration_pct ?? 0),
    cod_rto_rate: rates.cod_rto_rate,
    prepaid_rto_rate: rates.prepaid_rto_rate,
  };
}
export type CostInputs = Awaited<ReturnType<typeof costInputs>>;

/** COD cost at stake, in plain parts: cash handling + extra returns vs prepaid. */
export async function codCost(db: Db, eligible: number) {
  const ms = await getMerchantSettings(db);
  const rates = await rtoRates(db);
  const gap = Math.max(0, rates.cod_rto_rate - rates.prepaid_rto_rate);
  const cash = eligible * Number(ms.cod_fee);
  const returns = eligible * gap * Number(ms.rto_cost);
  return {
    eligible,
    cod_fee: Number(ms.cod_fee),
    rto_cost: Number(ms.rto_cost),
    cod_rto_rate: rates.cod_rto_rate,
    prepaid_rto_rate: rates.prepaid_rto_rate,
    gap,
    cash,
    returns,
    total: cash + returns,
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
