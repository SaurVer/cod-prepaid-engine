-- Speed: let the Overview's per-day counts read only the index (no wide row lookups).
create index if not exists orders_batch_cover_idx on orders (batch_id)
  include (id, payment_mode, eligible, converted_at, converted_via, lifecycle_state, dispatched, dispatch_deadline, placed_at, send_count);
create index if not exists run_orders_order_run_idx on run_orders (order_id, run_id);
create index if not exists sends_run_id_idx on sends (run_id, id);
