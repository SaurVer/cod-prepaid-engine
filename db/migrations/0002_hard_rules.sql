-- Hard rules (section 4), enforced in the database.

-- Which orders may enter a run.
create or replace function guard_run_order() returns trigger
language plpgsql as $$
declare
  o orders%rowtype;
  s system_settings%rowtype;
  ms merchant_settings%rowtype;
begin
  if (select is_pilot from runs where id = new.run_id) then
    return new; -- the seeded historical pilot is written after the fact
  end if;
  select * into o from orders where id = new.order_id;
  select * into s from system_settings where id = 1;
  select * into ms from merchant_settings where merchant_id = o.merchant_id;

  if not o.eligible then
    raise exception 'HARD_RULE: order % is not eligible for decisioning', o.id;
  end if;
  if o.converted_at is not null then
    raise exception 'HARD_RULE: order % has converted to prepaid and can never be messaged again', o.id;
  end if;
  if o.dispatched or o.final_outcome is not null or s.sim_now >= o.dispatch_deadline then
    raise exception 'HARD_RULE: order % is past its dispatch deadline', o.id;
  end if;
  if exists (select 1 from run_orders where order_id = o.id and assignment_group = 'holdout') then
    raise exception 'HARD_RULE: order % is a holdout order and cannot be resent', o.id;
  end if;
  if not new.is_resend then
    if exists (select 1 from run_orders where order_id = o.id) then
      raise exception 'HARD_RULE: order % has already been in a run (resends must be opted in)', o.id;
    end if;
  else
    if o.send_count < 1 then
      raise exception 'HARD_RULE: order % was never sent, so it cannot be a resend', o.id;
    end if;
    if o.send_count >= ms.max_sends then
      raise exception 'HARD_RULE: order % already reached the max sends per order', o.id;
    end if;
    if o.last_sent_at + make_interval(hours => ms.min_gap_hours) > s.sim_now then
      raise exception 'HARD_RULE: order % is inside the minimum gap between sends', o.id;
    end if;
  end if;
  return new;
end $$;

create trigger run_orders_guard before insert on run_orders
for each row execute function guard_run_order();

-- What may be sent.
create or replace function guard_send() returns trigger
language plpgsql as $$
declare
  o orders%rowtype;
  s system_settings%rowtype;
  ms merchant_settings%rowtype;
  g assignment_group;
  act action_type;
begin
  select * into o from orders where id = new.order_id for update;
  select * into s from system_settings where id = 1;
  select * into ms from merchant_settings where merchant_id = o.merchant_id;

  if o.converted_at is not null or o.lifecycle_state = 'converted' then
    raise exception 'HARD_RULE: order % has converted to prepaid and can never be messaged again', o.id;
  end if;
  if o.dispatched or o.final_outcome is not null or new.sent_at >= o.dispatch_deadline then
    raise exception 'HARD_RULE: order % is past its dispatch deadline', o.id;
  end if;
  if o.send_count >= ms.max_sends then
    raise exception 'HARD_RULE: order % already reached the max sends per order', o.id;
  end if;
  if o.last_sent_at is not null and o.last_sent_at + make_interval(hours => ms.min_gap_hours) > new.sent_at then
    raise exception 'HARD_RULE: order % is inside the minimum gap between sends', o.id;
  end if;
  select ro.assignment_group into g from run_orders ro where ro.run_id = new.run_id and ro.order_id = new.order_id;
  if g is null then
    raise exception 'HARD_RULE: order % is not part of run %', o.id, new.run_id;
  end if;
  if g = 'holdout' or exists (select 1 from run_orders where order_id = o.id and assignment_group = 'holdout') then
    raise exception 'HARD_RULE: order % is a holdout order and cannot be messaged', o.id;
  end if;
  select d.chosen_action into act from decisions d where d.run_id = new.run_id and d.order_id = new.order_id;
  if act is null or act = 'none' then
    raise exception 'HARD_RULE: order % has no message action in run %', o.id, new.run_id;
  end if;
  if new.discount_applied > ms.max_discount then
    raise exception 'HARD_RULE: discount on order % exceeds the max discount per order', o.id;
  end if;
  return new;
end $$;

create trigger sends_guard before insert on sends
for each row execute function guard_send();

-- A converted order cannot be turned back into a messageable state.
create or replace function guard_order_update() returns trigger
language plpgsql as $$
begin
  if old.converted_at is not null and new.converted_at is null then
    raise exception 'HARD_RULE: order % has converted to prepaid; conversion cannot be undone', old.id;
  end if;
  if old.converted_at is not null and new.send_count > old.send_count then
    raise exception 'HARD_RULE: order % has converted to prepaid and can never be messaged again', old.id;
  end if;
  return new;
end $$;

create trigger orders_guard before update on orders
for each row execute function guard_order_update();

-- The app talks to Postgres directly as the table owner. Turn on RLS with no policies so the
-- public REST API (anon key) can read nothing, including the hidden ground truth.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
