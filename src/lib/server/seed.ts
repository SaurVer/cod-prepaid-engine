// Chunked seed: reset → customers → 30-day randomised pilot (3 chunks) → model v1 → today's batch.

import { pilotOrder } from '../core/pilot.ts';
import { type Rng, defaultRng, randInt } from '../core/rng.ts';
import { type HiddenType, PILOT_TYPE_SHARES, TYPE_SHARES, generateRepeatCustomer, pickType } from '../core/sim.ts';
import type { Db } from './db.ts';
import { trainAndStore } from './model.ts';
import { approveAndSend, createRun, processNext } from './pipeline.ts';
import { DAY, DEFAULTS, HOUR, MERCHANT_ID, addDays, istDate, istDayStart, messageCost } from './settings.ts';
import { type NewOrder, customerStateFromRow, insertCustomers, insertOrders, resolveUntil } from './simulation.ts';
import { fillDay } from './sync.ts';

export const SEED_STEPS = [
  'reset', 'customers', 'pilot-1', 'pilot-2', 'pilot-3', 'train',
  'history-1', 'history-2', 'history-3', 'history-4', 'history-5', 'history-6', 'today',
] as const;
export type SeedStep = (typeof SEED_STEPS)[number];

export const SEED_STEP_LABELS: Record<SeedStep, string> = {
  reset: 'Clearing everything and writing settings',
  customers: 'Creating 15,000 customers',
  'pilot-1': 'Training pilot (before the 30 days): part 1',
  'pilot-2': 'Training pilot: part 2',
  'pilot-3': 'Training pilot: part 3',
  train: 'Training model v1 on the pilot',
  'history-1': 'Last 30 days: days 1–5 with campaigns',
  'history-2': 'Last 30 days: days 6–10',
  'history-3': 'Last 30 days: days 11–15',
  'history-4': 'Last 30 days: days 16–20',
  'history-5': 'Last 30 days: days 21–25',
  'history-6': 'Last 30 days: days 26–29',
  today: "Today's orders so far",
};

const N_CUSTOMERS = 15_000;
const PILOT_DAYS = 30;
const PILOT_PER_DAY = 500;
const iso = (ms: number) => new Date(ms).toISOString();

/** Today's IST date and the first day of the 30-day history. */
export function seedDates(nowMs = Date.now()) {
  const today = istDate(nowMs);
  const historyStart = addDays(today, -(DEFAULTS.history_days - 1));
  const pilotStart = addDays(historyStart, -PILOT_DAYS);
  return { today, historyStart, pilotStart };
}

async function setEngineTime(db: Db, ms: number) {
  await db.query(`update system_settings set sim_now = $1 where id = 1`, [iso(ms)]);
}

/** One seeded history day: orders until 9 PM, an evening campaign (templates, no LLM), the rest of the day. */
async function seedHistoryDay(db: Db, date: string) {
  const start = istDayStart(date);
  const campaignAt = start + DEFAULTS.history_campaign_hour * HOUR;
  await setEngineTime(db, start);
  await fillDay(db, date, campaignAt);
  await resolveUntil(db, campaignAt);
  await setEngineTime(db, campaignAt);
  const run = await createRun(db, { batchIds: [date], role: 'owner' });
  for (let i = 0; i < 50; i++) {
    const r = await processNext(db, { chunk: 1500, template: true, quiet: true });
    if (r.status === 'ready_for_review' || r.status === 'idle') break;
  }
  await approveAndSend(db, run.id, 'owner', { speed: 'history', quiet: true });
  await fillDay(db, date, start + DAY);
  await resolveUntil(db, start + DAY);
  await setEngineTime(db, start + DAY);
}

const TABLES = [
  'sim_pending', 'sim_draws', 'events', 'sends', 'messages', 'decisions', 'predictions', 'run_orders', 'runs',
  'orders', 'order_batches', 'customer_truth', 'customers', 'training_jobs', 'model_versions', 'notifications',
  'audit_log', 'integrations', 'system_settings', 'merchant_settings', 'merchants',
];

export async function runSeedStep(db: Db, step: SeedStep, rng: Rng = defaultRng): Promise<string> {
  const { today, historyStart, pilotStart } = seedDates();
  const start = istDayStart(historyStart);
  switch (step) {
    case 'reset': {
      await db.query(`truncate table ${TABLES.join(', ')} restart identity cascade`);
      const m = DEFAULTS.merchant;
      await db.query(
        `insert into merchants (id, name, brand_primary, brand_accent, tone_guide, created_at) values ($1, $2, $3, $4, $5, $6)`,
        [MERCHANT_ID, m.name, m.brand_primary, m.brand_accent, m.tone_guide, iso(start - 400 * DAY)],
      );
      const s = DEFAULTS.settings;
      await db.query(
        `insert into merchant_settings (merchant_id, margin, cod_fee, rto_cost, msg_cost_whatsapp, msg_cost_inbox,
           discount_amount, max_discount, holdout_pct, max_sends, min_gap_hours, dispatch_window_hours, active_model_version, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,null,$13)`,
        [MERCHANT_ID, s.margin, s.cod_fee, s.rto_cost, s.msg_cost_whatsapp, s.msg_cost_inbox, s.discount_amount,
          s.max_discount, s.holdout_pct, s.max_sends, s.min_gap_hours, s.dispatch_window_hours, iso(start)],
      );
      await db.query(
        `insert into system_settings (id, merchant_id, exploration_pct, sim_now, is_live, real_minutes_per_sim_day,
           last_real_tick, sim_started_at, seed_status)
         values (1, $1, $2, $3, true, $4, now(), $3, 'seeding')`,
        [MERCHANT_ID, DEFAULTS.exploration_pct, iso(istDayStart(pilotStart)), DEFAULTS.real_minutes_per_sim_day],
      );
      const integrations = [
        ['store_orders', 'Store orders', ['orders.read', 'customers.read']],
        ['payments', 'Payments', ['payments.read', 'payment_links.create']],
        ['courier_status', 'Courier delivery status', ['shipments.read', 'delivery_outcomes.read']],
        ['whatsapp', 'WhatsApp Business', ['messages.send', 'message_status.read']],
        ['mobile_inbox', 'Mobile inbox', ['notifications.send', 'notification_status.read']],
      ] as const;
      for (const [key, name, scopes] of integrations) {
        await db.query(
          `insert into integrations (merchant_id, key, name, connected, connected_at, last_sync_at, scopes, consent)
           values ($1, $2, $3, true, $4, $5, $6::text[], true)`,
          [MERCHANT_ID, key, name, iso(start - 60 * DAY), iso(start), scopes as unknown as string[]],
        );
      }
      await db.query(
        `insert into runs (id, merchant_id, is_pilot, created_by_role, created_at, source_batch_ids, status, settings_snapshot)
         values (0, $1, true, 'owner', $2, '{}'::text[], 'closed', $3::jsonb)`,
        [MERCHANT_ID, iso(istDayStart(pilotStart)), JSON.stringify({ ...s, exploration_pct: DEFAULTS.exploration_pct })],
      );
      return 'Settings written';
    }

    case 'customers': {
      const rows = [];
      for (let i = 1; i <= N_CUSTOMERS; i++) {
        const type = pickType(rng, TYPE_SHARES);
        const state = generateRepeatCustomer(rng, type);
        rows.push({
          id: i,
          state,
          type,
          createdAt: start - randInt(rng, 60, 400) * DAY,
          lastOrderAt: start - state.days_since_last_order * DAY,
        });
      }
      for (let i = 0; i < rows.length; i += 5000) await insertCustomers(db, rows.slice(i, i + 5000));
      return `${rows.length} customers`;
    }

    case 'pilot-1':
    case 'pilot-2':
    case 'pilot-3': {
      const part = Number(step.slice(-1)) - 1;
      const days = Array.from({ length: 10 }, (_, i) => part * 10 + i);
      const pool = await db.query(
        `select c.*, t.hidden_type from customers c join customer_truth t on t.customer_id = c.id where c.id <= $1`,
        [N_CUSTOMERS],
      );
      const byType = new Map<HiddenType, typeof pool>();
      for (const c of pool) {
        const list = byType.get(c.hidden_type) ?? [];
        list.push(c);
        byType.set(c.hidden_type, list);
      }
      const ms = DEFAULTS.settings;
      let nextOrder = part * 10 * PILOT_PER_DAY + 1;
      let seq = nextOrder;
      const orders: NewOrder[] = [];
      const ro: { order_id: number; seq: number; group: string }[] = [];
      const dec: { order_id: number; action: string; reason: string; discount: number; mcost: number }[] = [];
      for (const d of days) {
        const date = addDays(pilotStart, d);
        const day = istDayStart(date) + 12 * HOUR;
        for (let i = 0; i < PILOT_PER_DAY; i++) {
          const type = pickType(rng, PILOT_TYPE_SHARES);
          const list = byType.get(type)!;
          const c = list[randInt(rng, 0, list.length - 1)];
          const state = { ...customerStateFromRow(c, day), days_since_last_order: randInt(rng, 7, 60) };
          const po = pilotOrder(rng, state, type);
          const id = nextOrder++;
          const messaged = po.action !== 'none';
          const mcost = messaged ? messageCost(ms, state.preferred_channel) : 0;
          const deadline = day + DAY;
          orders.push({
            id,
            batch_id: date,
            customer_id: Number(c.id),
            value: po.value,
            payment_mode: 'cod',
            is_first_time: false,
            eligible: true,
            ineligible_reason: null,
            rto_risk_flag: false,
            placed_at: day,
            dispatch_deadline: deadline,
            lifecycle_state: po.outcome.final,
            features: po.features,
            send_count: messaged ? 1 : 0,
            last_sent_at: messaged ? day + 2 * HOUR : null,
            converted_at: po.outcome.converted ? day + 6 * HOUR : null,
            converted_via: po.outcome.via,
            discount_paid: po.outcome.via === 'discount' ? ms.discount_amount : 0,
            message_cost: mcost,
            dispatched: true,
            final_outcome: po.outcome.final,
            outcome_at: po.outcome.final === 'cancelled' ? deadline : deadline + 3 * DAY,
          });
          ro.push({ order_id: id, seq: seq++, group: messaged ? 'explore' : 'holdout' });
          dec.push({
            order_id: id,
            action: po.action,
            reason: messaged ? 'explore' : 'holdout',
            discount: po.action === 'discount' ? ms.discount_amount : 0,
            mcost,
          });
        }
        await db.query(
          `insert into order_batches (id, merchant_id, sim_date, is_pilot, total_orders, cod_orders, eligible_orders, arrived_at)
           values ($1, $2, $3::date, true, $4, $4, $4, $5)`,
          [date, MERCHANT_ID, date, PILOT_PER_DAY, iso(day)],
        );
      }
      await insertOrders(db, orders);
      await db.query(
        `insert into run_orders (run_id, order_id, merchant_id, seq, assignment_group)
         select 0, oid, ${MERCHANT_ID}, sq, g::assignment_group from unnest($1::bigint[], $2::int[], $3::text[]) as t(oid, sq, g)`,
        [ro.map((r) => r.order_id), ro.map((r) => r.seq), ro.map((r) => r.group)],
      );
      await db.query(
        `insert into decisions (run_id, order_id, merchant_id, chosen_action, reason_code, discount_applied, message_cost)
         select 0, oid, ${MERCHANT_ID}, a::action_type, r::reason_code, disc, mc
         from unnest($1::bigint[], $2::text[], $3::text[], $4::numeric[], $5::numeric[]) as t(oid, a, r, disc, mc)`,
        [dec.map((r) => r.order_id), dec.map((r) => r.action), dec.map((r) => r.reason), dec.map((r) => r.discount), dec.map((r) => r.mcost)],
      );
      await db.query(`update runs set order_count = order_count + $1 where id = 0`, [orders.length]);
      return `${orders.length} pilot orders`;
    }

    case 'train': {
      const v = await trainAndStore(db, { version: 1, activate: true, simAt: start });
      return `Model v${v.version} trained on ${v.training_rows} rows`;
    }

    case 'history-1':
    case 'history-2':
    case 'history-3':
    case 'history-4':
    case 'history-5':
    case 'history-6': {
      const part = Number(step.slice(-1)) - 1;
      const days: string[] = [];
      for (let i = part * 5; i < Math.min(part * 5 + 5, DEFAULTS.history_days - 1); i++) days.push(addDays(historyStart, i));
      for (const d of days) await seedHistoryDay(db, d);
      return `${days.length} days with campaigns (${days[0]} to ${days[days.length - 1]})`;
    }

    case 'today': {
      const now = Date.now();
      await setEngineTime(db, istDayStart(today));
      const added = await fillDay(db, today, now);
      await resolveUntil(db, now);
      await db.query(
        `update system_settings set sim_now = $1, seed_status = 'ready', last_real_tick = now() where id = 1`,
        [iso(now)],
      );
      return `${added.toLocaleString('en-IN')} orders so far today (${today})`;
    }
  }
}
