-- COD-to-Prepaid Decision Engine · schema (concept prototype, synthetic data)
-- All timestamps are simulated time unless the column name ends in _real_at.

create type payment_mode as enum ('cod', 'prepaid');
create type lifecycle_state as enum (
  'new', 'eligible', 'in_run', 'decided', 'holdout', 'message_drafted', 'approved',
  'sent', 'converted', 'not_converted', 'delivered', 'rto', 'cancelled'
);
create type final_outcome as enum ('delivered', 'rto', 'cancelled');
create type action_type as enum ('none', 'nudge', 'discount');
create type assignment_group as enum ('model', 'holdout', 'explore');
create type reason_code as enum ('best_gain', 'no_positive_gain', 'cap_applied', 'holdout', 'explore');
create type run_status as enum (
  'queued', 'scoring', 'deciding', 'drafting', 'ready_for_review', 'approved', 'sent', 'closed', 'paused'
);
create type channel_type as enum ('whatsapp', 'mobile_inbox');
create type send_status as enum ('sent', 'delivered');
create type event_type as enum ('delivered', 'opened', 'clicked', 'converted');
create type model_status as enum ('candidate', 'active', 'retired');
create type user_role as enum ('owner', 'analyst');
create type variant_tag as enum ('reminder', 'reassurance', 'offer');
create type hidden_type as enum ('habitual', 'price_sensitive', 'delivery_worried', 'cash_only');
create type review_state as enum ('pending', 'approved', 'rejected');
create type conversion_via as enum ('organic', 'nudge', 'discount');

create table merchants (
  id int primary key,
  name text not null,
  brand_primary text not null,
  brand_accent text not null,
  tone_guide text not null,
  created_at timestamptz not null
);

create table merchant_settings (
  merchant_id int primary key references merchants(id),
  margin numeric(10,2) not null,
  cod_fee numeric(10,2) not null,
  rto_cost numeric(10,2) not null,
  msg_cost_whatsapp numeric(10,2) not null,
  msg_cost_inbox numeric(10,2) not null,
  discount_amount numeric(10,2) not null,
  max_discount numeric(10,2) not null,
  holdout_pct numeric(5,4) not null check (holdout_pct between 0 and 0.5),
  max_sends int not null check (max_sends between 1 and 5),
  min_gap_hours int not null check (min_gap_hours >= 0),
  dispatch_window_hours int not null default 24,
  active_model_version int,
  updated_at timestamptz not null
);

-- Admin-only settings and the simulation clock (single row).
create table system_settings (
  id int primary key default 1 check (id = 1),
  merchant_id int not null references merchants(id),
  exploration_pct numeric(5,4) not null check (exploration_pct between 0 and 0.5),
  sim_now timestamptz not null,
  is_live boolean not null default true,
  real_minutes_per_sim_day numeric(8,2) not null default 10,
  last_real_tick timestamptz not null default now(),
  sim_started_at timestamptz not null,
  seed_status text not null default 'ready'
);

create table integrations (
  id serial primary key,
  merchant_id int not null references merchants(id),
  key text not null,
  name text not null,
  connected boolean not null,
  connected_at timestamptz,
  last_sync_at timestamptz,
  scopes text[] not null,
  consent boolean not null,
  unique (merchant_id, key)
);

create table customers (
  id int primary key,
  merchant_id int not null references merchants(id),
  city_tier smallint not null,
  first_order_at timestamptz,
  total_orders int not null,
  delivered_orders int not null,
  rto_count int not null,
  cod_orders int not null,
  prepaid_orders int not null,
  last_order_at timestamptz,
  last_category text not null,
  past_offer_response_rate numeric(4,2) not null,
  past_delivery_issue boolean not null,
  preferred_channel channel_type not null,
  consent_whatsapp boolean not null,
  consent_inbox boolean not null,
  created_at timestamptz not null
);

-- Hidden ground truth. Read only by the simulation; never by the model or the UI.
create table customer_truth (
  customer_id int primary key references customers(id),
  merchant_id int not null references merchants(id),
  hidden_type hidden_type not null,
  rto_propensity numeric(6,4) not null
);

create table order_batches (
  id text primary key, -- the sim date, YYYY-MM-DD
  merchant_id int not null references merchants(id),
  sim_date date not null,
  is_pilot boolean not null default false,
  total_orders int not null,
  cod_orders int not null,
  eligible_orders int not null,
  arrived_at timestamptz not null
);

create table orders (
  id bigint primary key,
  merchant_id int not null references merchants(id),
  batch_id text not null references order_batches(id),
  customer_id int not null references customers(id),
  value numeric(10,2) not null,
  payment_mode payment_mode not null,
  is_first_time boolean not null,
  eligible boolean not null,
  ineligible_reason text,
  rto_risk_flag boolean not null,
  placed_at timestamptz not null,
  dispatch_deadline timestamptz not null,
  lifecycle_state lifecycle_state not null,
  send_count int not null default 0,
  last_sent_at timestamptz,
  converted_at timestamptz,
  converted_via conversion_via,
  discount_paid numeric(10,2) not null default 0,
  message_cost numeric(10,2) not null default 0,
  dispatched boolean not null default false,
  final_outcome final_outcome,
  outcome_at timestamptz,
  used_in_training_version int,
  features jsonb -- visible features as the model sees them, frozen at order time
);

create table runs (
  id int primary key,
  merchant_id int not null references merchants(id),
  is_pilot boolean not null default false,
  created_by_role user_role not null,
  created_at timestamptz not null,
  created_real_at timestamptz not null default now(),
  source_batch_ids text[] not null,
  includes_resends boolean not null default false,
  status run_status not null,
  order_count int not null default 0,
  scored_count int not null default 0,
  decided_count int not null default 0,
  draft_total int not null default 0,
  drafted_count int not null default 0,
  progress numeric(5,2) not null default 0,
  eta_seconds int,
  started_real_at timestamptz,
  finished_real_at timestamptz,
  lease_until timestamptz,
  model_version int,
  settings_snapshot jsonb not null,
  approved_at timestamptz,
  approved_by_role user_role
);

create table run_orders (
  run_id int not null references runs(id),
  order_id bigint not null references orders(id),
  merchant_id int not null references merchants(id),
  seq int not null,
  assignment_group assignment_group,
  send_attempt_number int not null default 1,
  is_resend boolean not null default false,
  primary key (run_id, order_id)
);

create table predictions (
  run_id int not null references runs(id),
  order_id bigint not null references orders(id),
  merchant_id int not null references merchants(id),
  model_version int not null,
  p_convert_none numeric(8,6) not null,
  p_convert_nudge numeric(8,6) not null,
  p_convert_discount numeric(8,6) not null,
  p_cancel_none numeric(8,6) not null,
  p_cancel_nudge numeric(8,6) not null,
  p_cancel_discount numeric(8,6) not null,
  r_cod_none numeric(8,6) not null,
  r_cod_nudge numeric(8,6) not null,
  r_cod_discount numeric(8,6) not null,
  r_pre_none numeric(8,6) not null,
  r_pre_nudge numeric(8,6) not null,
  r_pre_discount numeric(8,6) not null,
  primary key (run_id, order_id)
);

create table decisions (
  run_id int not null references runs(id),
  order_id bigint not null references orders(id),
  merchant_id int not null references merchants(id),
  ev_none numeric(12,4),
  ev_nudge numeric(12,4),
  ev_discount numeric(12,4),
  gain_nudge numeric(12,4),
  gain_discount numeric(12,4),
  chosen_action action_type not null,
  reason_code reason_code not null,
  discount_applied numeric(10,2) not null default 0,
  message_cost numeric(10,2) not null default 0,
  detail jsonb, -- every intermediate number: π, payoffs, contributions, settings used
  primary key (run_id, order_id)
);

create table messages (
  id bigserial primary key,
  run_id int not null references runs(id),
  order_id bigint not null references orders(id),
  merchant_id int not null references merchants(id),
  channel channel_type not null,
  llm_prompt text,
  llm_output text,
  edited_text text,
  final_text text not null,
  variant_tag variant_tag not null,
  fallback_used boolean not null default false,
  review review_state not null default 'pending',
  approved boolean not null default false,
  edited_at timestamptz,
  unique (run_id, order_id)
);

create table sends (
  id bigserial primary key,
  run_id int not null references runs(id),
  order_id bigint not null references orders(id),
  message_id bigint not null references messages(id),
  merchant_id int not null references merchants(id),
  channel channel_type not null,
  action action_type not null,
  discount_applied numeric(10,2) not null default 0,
  message_cost numeric(10,2) not null default 0,
  attempt int not null default 1,
  sent_at timestamptz not null,
  status send_status not null default 'sent'
);

create table events (
  id bigserial primary key,
  send_id bigint not null references sends(id),
  order_id bigint not null references orders(id),
  merchant_id int not null references merchants(id),
  type event_type not null,
  at timestamptz not null
);

create table model_versions (
  version int primary key,
  merchant_id int not null references merchants(id),
  trained_at timestamptz not null,
  trained_real_at timestamptz not null default now(),
  training_rows int not null,
  metrics jsonb not null,
  weights jsonb not null,
  status model_status not null,
  promoted_at timestamptz
);

create table training_jobs (
  id serial primary key,
  merchant_id int not null references merchants(id),
  version int not null,
  step int not null default 0,
  total_steps int not null,
  status text not null default 'running',
  partial jsonb,
  started_real_at timestamptz not null default now(),
  lease_until timestamptz
);

create table audit_log (
  id bigserial primary key,
  merchant_id int not null references merchants(id),
  role user_role not null,
  action text not null,
  target text,
  before jsonb,
  after jsonb,
  at timestamptz not null
);

create table notifications (
  id bigserial primary key,
  merchant_id int not null references merchants(id),
  type text not null,
  message text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null,
  created_real_at timestamptz not null default now()
);

-- Simulation internals: per-order random draws and scheduled future happenings.
create table sim_draws (
  order_id bigint primary key references orders(id),
  u_conv real not null,
  u_conv2 real not null,
  u_cancel real not null,
  u_rto real not null,
  u_open real not null,
  u_click real not null,
  u_noise real not null,
  u_time real not null
);

create table sim_pending (
  id bigserial primary key,
  due_at timestamptz not null,
  kind text not null, -- 'event' | 'conversion' | 'outcome'
  order_id bigint not null references orders(id),
  send_id bigint references sends(id),
  payload jsonb not null default '{}'::jsonb
);

-- Indexes (Appendix A plus the ones the tick and pages need)
create index orders_batch_idx on orders(batch_id);
create index orders_lifecycle_idx on orders(lifecycle_state);
create index orders_customer_idx on orders(customer_id);
create index orders_dispatch_idx on orders(dispatch_deadline) where eligible and not dispatched;
create index orders_outcome_idx on orders(outcome_at);
create index run_orders_run_idx on run_orders(run_id);
create index run_orders_order_idx on run_orders(order_id);
create index predictions_run_order_idx on predictions(run_id, order_id);
create index decisions_run_order_idx on decisions(run_id, order_id);
create index messages_run_idx on messages(run_id);
create index sends_run_idx on sends(run_id);
create index sends_order_idx on sends(order_id);
create index events_send_idx on events(send_id);
create index events_order_idx on events(order_id);
create index sim_pending_due_idx on sim_pending(due_at);
create index sim_pending_order_idx on sim_pending(order_id);
create index notifications_idx on notifications(merchant_id, id desc);
