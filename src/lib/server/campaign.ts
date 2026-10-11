import type { Db } from './db.ts';

/** What the AI decided for the AI-picked orders, plus control/test counts and sample messages. */
export async function campaignDecisions(db: Db, runId: number) {
  const cards = await db.query(
    `select d.chosen_action as action, count(*)::int as n,
       coalesce(sum(case d.chosen_action when 'nudge' then d.gain_nudge when 'discount' then d.gain_discount else 0 end), 0) as gain
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
    `select distinct on (d.chosen_action) d.chosen_action as action, m.final_text, m.fallback_used
     from messages m
     join decisions d on d.run_id = m.run_id and d.order_id = m.order_id
     join run_orders ro on ro.run_id = m.run_id and ro.order_id = m.order_id
     where m.run_id = $1 and ro.assignment_group = 'model'
     order by d.chosen_action, m.fallback_used, m.id`,
    [runId],
  );
  const [fb] = await db.query(
    `select count(*) filter (where fallback_used)::int as fallback, count(*)::int as total from messages where run_id = $1`,
    [runId],
  );
  return { cards, groups, samples, fallbacks: fb };
}
