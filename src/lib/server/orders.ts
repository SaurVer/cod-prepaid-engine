import type { Db } from './db.ts';

export interface OrderFilters {
  date?: string;
  from?: string;
  to?: string;
  view?: string; // all | cod | prepaid | eligible | paid | messaged | ready
  group?: string; // model | holdout | explore | none
  status?: string; // lifecycle state
  training?: string; // yes | no
  page?: number;
}

export const PAGE_SIZE = 50;

export async function listOrders(db: Db, f: OrderFilters) {
  const where: string[] = ['b.is_pilot = false'];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.date) where.push(`o.batch_id = ${p(f.date)}`);
  else {
    if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) where.push(`o.batch_id >= ${p(f.from)}`);
    if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) where.push(`o.batch_id <= ${p(f.to)}`);
  }
  switch (f.view) {
    case 'cod':
      where.push(`o.payment_mode = 'cod'`);
      break;
    case 'prepaid':
      where.push(`o.payment_mode = 'prepaid'`);
      break;
    case 'eligible':
      where.push(`o.eligible`);
      break;
    case 'ready':
      where.push(`o.eligible and o.lifecycle_state = 'eligible' and o.converted_at is null and not o.dispatched`);
      break;
    case 'messaged':
      where.push(`o.send_count > 0`);
      break;
    case 'paid':
      where.push(`o.converted_via in ('nudge', 'discount')`);
      break;
  }
  if (f.group === 'none') where.push(`lr.assignment_group is null`);
  else if (f.group) where.push(`lr.assignment_group = ${p(f.group)}::assignment_group`);
  if (f.status) where.push(`o.lifecycle_state = ${p(f.status)}::lifecycle_state`);
  if (f.training === 'yes') where.push(`o.used_in_training_version is not null`);
  if (f.training === 'no') where.push(`o.used_in_training_version is null`);
  const page = Math.max(1, f.page ?? 1);
  // Non-pilot orders are in at most one campaign, so a plain join is enough (and much faster than a lateral).
  const joins = `
    left join run_orders lr on lr.order_id = o.id and lr.run_id > 0
    left join decisions d on d.run_id = lr.run_id and d.order_id = o.id`;
  const from = `from orders o join order_batches b on b.id = o.batch_id`;
  const rows = await db.query(
    `select o.id, o.batch_id, o.customer_id, o.value, o.payment_mode, o.is_first_time, o.eligible, o.ineligible_reason,
       o.placed_at, o.lifecycle_state, o.send_count, o.converted_at, o.converted_via, o.final_outcome,
       o.used_in_training_version, lr.run_id, lr.assignment_group, d.chosen_action
     ${from} ${joins} where ${where.join(' and ')}
     order by o.placed_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    params,
  );
  const needsRun = Boolean(f.group);
  const [{ n }] = await db.query(
    `select count(*)::int as n ${from} ${needsRun ? 'left join run_orders lr on lr.order_id = o.id and lr.run_id > 0' : ''}
     where ${where.join(' and ')}`,
    params,
  );
  return { rows, total: Number(n), page, pages: Math.max(1, Math.ceil(Number(n) / PAGE_SIZE)) };
}

export async function ordersByDay(db: Db) {
  return db.query(
    `select b.id as date, b.total_orders, b.cod_orders, b.eligible_orders,
       count(ro.order_id) filter (where ro.run_id is not null)::int as worked_on,
       count(o.id) filter (where o.send_count > 0)::int as sent,
       count(o.id) filter (where o.send_count > 1)::int as resent,
       count(ro.order_id) filter (where ro.assignment_group = 'holdout')::int as control,
       count(o.id) filter (where o.converted_at is not null and o.eligible)::int as paid_online,
       count(o.id) filter (where o.final_outcome is not null and o.eligible)::int as resolved,
       count(o.id) filter (where o.used_in_training_version is not null)::int as in_training
     from order_batches b
     join orders o on o.batch_id = b.id
     left join run_orders ro on ro.order_id = o.id and ro.run_id > 0
     where not b.is_pilot
     group by b.id, b.total_orders, b.cod_orders, b.eligible_orders, b.sim_date
     order by b.sim_date desc`,
  );
}
