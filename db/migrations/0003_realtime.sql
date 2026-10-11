-- v2: real calendar days. Batches arrive through the day; temporary QA snapshot store.
alter table order_batches add column if not exists planned_total int not null default 0;
alter table order_batches add column if not exists last_order_at timestamptz;
create index if not exists orders_placed_idx on orders(placed_at);
create index if not exists orders_batch_eligible_idx on orders(batch_id) where eligible;
create index if not exists runs_batches_idx on runs using gin (source_batch_ids);
create table if not exists qa_snapshots (id serial primary key, name text not null, data text not null, created_at timestamptz default now());
alter table qa_snapshots enable row level security;
