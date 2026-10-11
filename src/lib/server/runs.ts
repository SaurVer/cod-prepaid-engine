import type { Db } from './db.ts';

export async function listRuns(db: Db) {
  return db.query(
    `select r.id, r.status, r.created_at, r.source_batch_ids, r.order_count, r.model_version, r.progress, r.eta_seconds,
       r.created_by_role, r.approved_at,
       coalesce(sum(case d.chosen_action when 'nudge' then d.gain_nudge when 'discount' then d.gain_discount else 0 end)
         filter (where ro.assignment_group = 'model'), 0) as expected_gain
     from runs r
     left join run_orders ro on ro.run_id = r.id
     left join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     where not r.is_pilot
     group by r.id
     order by r.id desc`,
  );
}

export async function runReview(db: Db, runId: number) {
  const [run] = await db.query(`select * from runs where id = $1 and not is_pilot`, [runId]);
  if (!run) return null;
  const cards = await db.query(
    `select d.chosen_action as action, count(*)::int as n,
       coalesce(sum(case d.chosen_action when 'nudge' then d.gain_nudge when 'discount' then d.gain_discount else 0 end), 0) as gain,
       coalesce(sum(case d.chosen_action when 'nudge' then d.ev_nudge when 'discount' then d.ev_discount else d.ev_none end), 0) as ev
     from run_orders ro join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     where ro.run_id = $1 and ro.assignment_group = 'model'
     group by d.chosen_action`,
    [runId],
  );
  const groups = await db.query(
    `select ro.assignment_group as g, d.chosen_action as action, count(*)::int as n
     from run_orders ro join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     where ro.run_id = $1 group by 1, 2`,
    [runId],
  );
  const samples = await db.query(
    `select distinct on (d.chosen_action) d.chosen_action as action, m.final_text, m.variant_tag, m.order_id, m.fallback_used
     from messages m
     join decisions d on d.run_id = m.run_id and d.order_id = m.order_id
     join run_orders ro on ro.run_id = m.run_id and ro.order_id = m.order_id
     where m.run_id = $1 and ro.assignment_group = 'model'
     order by d.chosen_action, m.fallback_used, m.id`,
    [runId],
  );
  const [fallbacks] = await db.query(
    `select count(*) filter (where fallback_used)::int as fallback, count(*)::int as total from messages where run_id = $1`,
    [runId],
  );
  return { run, cards, groups, samples, fallbacks };
}
