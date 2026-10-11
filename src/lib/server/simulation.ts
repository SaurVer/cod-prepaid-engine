// Live store simulation: daily order batches, engagement events, conversions, dispatch and outcomes.
// Reads hidden ground truth; nothing here is exposed to the model or the UI directly.

import type { Action } from '../core/decide.ts';
import { snapshotFor } from '../core/pilot.ts';
import { type Rng, defaultRng, randInt, uniform } from '../core/rng.ts';
import {
  type CustomerState,
  type Draws,
  type HiddenType,
  TYPE_SHARES,
  codRtoRate,
  codShare,
  converts,
  cancels,
  engagement,
  generateFirstTimeCustomer,
  makeDraws,
  orderValue,
  pickType,
  prepaidRtoRate,
  rtoRiskFlag,
  trueConversion,
} from '../core/sim.ts';
import type { Db, Row } from './db.ts';
import { DAY, HOUR, MERCHANT_ID } from './settings.ts';

const iso = (ms: number) => new Date(ms).toISOString();

export function customerStateFromRow(c: Row, atMs: number): CustomerState {
  return {
    city_tier: Number(c.city_tier),
    total_orders: Number(c.total_orders),
    delivered_orders: Number(c.delivered_orders),
    rto_count: Number(c.rto_count),
    cod_orders: Number(c.cod_orders),
    prepaid_orders: Number(c.prepaid_orders),
    last_category: c.last_category,
    past_offer_response_rate: Number(c.past_offer_response_rate),
    past_delivery_issue: Boolean(c.past_delivery_issue),
    preferred_channel: c.preferred_channel,
    days_since_last_order: c.last_order_at
      ? Math.max(0, Math.round((atMs - Date.parse(c.last_order_at)) / DAY))
      : 0,
  };
}

export async function insertCustomers(
  db: Db,
  rows: { id: number; state: CustomerState; type: HiddenType; createdAt: number; lastOrderAt: number | null }[],
): Promise<void> {
  if (!rows.length) return;
  await db.query(
    `insert into customers (id, merchant_id, city_tier, first_order_at, total_orders, delivered_orders, rto_count,
       cod_orders, prepaid_orders, last_order_at, last_category, past_offer_response_rate, past_delivery_issue,
       preferred_channel, consent_whatsapp, consent_inbox, created_at)
     select id, ${MERCHANT_ID}, tier, first_at, total, delivered, rto, cod, prepaid, last_at, cat, offer, issue,
       channel::channel_type, true, true, created
     from unnest($1::int[], $2::smallint[], $3::timestamptz[], $4::int[], $5::int[], $6::int[], $7::int[], $8::int[],
       $9::timestamptz[], $10::text[], $11::numeric[], $12::boolean[], $13::text[], $14::timestamptz[])
       as t(id, tier, first_at, total, delivered, rto, cod, prepaid, last_at, cat, offer, issue, channel, created)`,
    [
      rows.map((r) => r.id),
      rows.map((r) => r.state.city_tier),
      rows.map((r) => (r.state.total_orders > 0 ? iso(r.createdAt) : null)),
      rows.map((r) => r.state.total_orders),
      rows.map((r) => r.state.delivered_orders),
      rows.map((r) => r.state.rto_count),
      rows.map((r) => r.state.cod_orders),
      rows.map((r) => r.state.prepaid_orders),
      rows.map((r) => (r.lastOrderAt == null ? null : iso(r.lastOrderAt))),
      rows.map((r) => r.state.last_category),
      rows.map((r) => r.state.past_offer_response_rate),
      rows.map((r) => r.state.past_delivery_issue),
      rows.map((r) => r.state.preferred_channel),
      rows.map((r) => iso(r.createdAt)),
    ],
  );
  await db.query(
    `insert into customer_truth (customer_id, merchant_id, hidden_type, rto_propensity)
     select id, ${MERCHANT_ID}, ht::hidden_type, rp from unnest($1::int[], $2::text[], $3::numeric[]) as t(id, ht, rp)`,
    [rows.map((r) => r.id), rows.map((r) => r.type), rows.map((r) => Number(codRtoRate(r.state).toFixed(4)))],
  );
}

export interface NewOrder {
  id: number;
  batch_id: string;
  customer_id: number;
  value: number;
  payment_mode: 'cod' | 'prepaid';
  is_first_time: boolean;
  eligible: boolean;
  ineligible_reason: string | null;
  rto_risk_flag: boolean;
  placed_at: number;
  dispatch_deadline: number;
  lifecycle_state: string;
  features: object;
  // optional resolved fields (pilot)
  send_count?: number;
  last_sent_at?: number | null;
  converted_at?: number | null;
  converted_via?: string | null;
  discount_paid?: number;
  message_cost?: number;
  dispatched?: boolean;
  final_outcome?: string | null;
  outcome_at?: number | null;
}

export async function insertOrders(db: Db, rows: NewOrder[]): Promise<void> {
  if (!rows.length) return;
  const t = (x: number | null | undefined) => (x == null ? null : iso(x));
  await db.query(
    `insert into orders (id, merchant_id, batch_id, customer_id, value, payment_mode, is_first_time, eligible,
       ineligible_reason, rto_risk_flag, placed_at, dispatch_deadline, lifecycle_state, features, send_count,
       last_sent_at, converted_at, converted_via, discount_paid, message_cost, dispatched, final_outcome, outcome_at)
     select id, ${MERCHANT_ID}, batch, cust, val, pm::payment_mode, ft, el, reason, rf, placed, deadline,
       ls::lifecycle_state, feat::jsonb, sc, lsa, cat_, cv::conversion_via, dp, mc, disp, fo::final_outcome, oa
     from unnest($1::bigint[], $2::text[], $3::int[], $4::numeric[], $5::text[], $6::boolean[], $7::boolean[],
       $8::text[], $9::boolean[], $10::timestamptz[], $11::timestamptz[], $12::text[], $13::text[], $14::int[],
       $15::timestamptz[], $16::timestamptz[], $17::text[], $18::numeric[], $19::numeric[], $20::boolean[],
       $21::text[], $22::timestamptz[])
       as t(id, batch, cust, val, pm, ft, el, reason, rf, placed, deadline, ls, feat, sc, lsa, cat_, cv, dp, mc, disp, fo, oa)`,
    [
      rows.map((r) => r.id),
      rows.map((r) => r.batch_id),
      rows.map((r) => r.customer_id),
      rows.map((r) => r.value),
      rows.map((r) => r.payment_mode),
      rows.map((r) => r.is_first_time),
      rows.map((r) => r.eligible),
      rows.map((r) => r.ineligible_reason),
      rows.map((r) => r.rto_risk_flag),
      rows.map((r) => t(r.placed_at)),
      rows.map((r) => t(r.dispatch_deadline)),
      rows.map((r) => r.lifecycle_state),
      rows.map((r) => JSON.stringify(r.features)),
      rows.map((r) => r.send_count ?? 0),
      rows.map((r) => t(r.last_sent_at)),
      rows.map((r) => t(r.converted_at)),
      rows.map((r) => r.converted_via ?? null),
      rows.map((r) => r.discount_paid ?? 0),
      rows.map((r) => r.message_cost ?? 0),
      rows.map((r) => r.dispatched ?? false),
      rows.map((r) => r.final_outcome ?? null),
      rows.map((r) => t(r.outcome_at)),
    ],
  );
}

export async function insertDraws(db: Db, rows: { order_id: number; d: Draws }[]): Promise<void> {
  if (!rows.length) return;
  const col = (k: keyof Draws) => rows.map((r) => r.d[k]);
  await db.query(
    `insert into sim_draws (order_id, u_conv, u_conv2, u_cancel, u_rto, u_open, u_click, u_noise, u_time)
     select * from unnest($1::bigint[], $2::real[], $3::real[], $4::real[], $5::real[], $6::real[], $7::real[], $8::real[], $9::real[])`,
    [
      rows.map((r) => r.order_id),
      col('u_conv'),
      col('u_conv2'),
      col('u_cancel'),
      col('u_rto'),
      col('u_open'),
      col('u_click'),
      col('u_noise'),
      col('u_time'),
    ],
  );
}

interface Pending {
  due_at: number;
  kind: 'event' | 'conversion' | 'outcome';
  order_id: number;
  send_id: number | null;
  payload: object;
}

export async function insertPending(db: Db, rows: Pending[]): Promise<void> {
  if (!rows.length) return;
  await db.query(
    `insert into sim_pending (due_at, kind, order_id, send_id, payload)
     select due, k, oid, sid, p::jsonb from unnest($1::timestamptz[], $2::text[], $3::bigint[], $4::bigint[], $5::text[])
       as t(due, k, oid, sid, p)`,
    [
      rows.map((r) => iso(r.due_at)),
      rows.map((r) => r.kind),
      rows.map((r) => r.order_id),
      rows.map((r) => r.send_id),
      rows.map((r) => JSON.stringify(r.payload)),
    ],
  );
}

/** Ingest one sim day's order batch. Returns null if that day already arrived. */
export async function ingestBatch(db: Db, date: string, atMs: number, rng: Rng = defaultRng) {
  const exists = await db.query('select 1 from order_batches where id = $1', [date]);
  if (exists.length) return null;

  const dow = new Date(atMs).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  let n = randInt(rng, 2000, 5000);
  if (weekend) n = Math.round(n * 1.1);
  const nRepeat = Math.round(n * uniform(rng, 0.55, 0.65));
  const nNew = n - nRepeat;

  const pool = await db.query(
    `select c.*, t.hidden_type from customers c join customer_truth t on t.customer_id = c.id
     where c.delivered_orders >= 1
       and not exists (select 1 from orders o where o.customer_id = c.id and o.eligible and not o.dispatched)
     order by random() limit $1`,
    [nRepeat],
  );
  const [{ max_c }] = await db.query('select coalesce(max(id), 0) as max_c from customers');
  const [{ max_o }] = await db.query('select coalesce(max(id), 0) as max_o from orders');
  let nextCustomer = Number(max_c) + 1;
  let nextOrder = Number(max_o) + 1;

  const newCustomers: { id: number; state: CustomerState; type: HiddenType; createdAt: number; lastOrderAt: null }[] = [];
  for (let i = 0; i < nNew; i++) {
    newCustomers.push({
      id: nextCustomer++,
      state: generateFirstTimeCustomer(rng),
      type: pickType(rng, TYPE_SHARES),
      createdAt: atMs,
      lastOrderAt: null,
    });
  }
  await insertCustomers(db, newCustomers);

  const placed = atMs;
  const deadline = atMs + DAY;
  const orders: NewOrder[] = [];
  const draws: { order_id: number; d: Draws }[] = [];
  const pending: Pending[] = [];

  const addOrder = (customerId: number, state: CustomerState, type: HiddenType, firstTime: boolean) => {
    const id = nextOrder++;
    const value = orderValue(rng);
    const codP = firstTime ? 0.6 : 0.64 * codShare(state);
    const mode: 'cod' | 'prepaid' = rng() < codP ? 'cod' : 'prepaid';
    const risk = !firstTime && rtoRiskFlag(state);
    let reason: string | null = null;
    if (mode === 'prepaid') reason = 'Prepaid order';
    else if (firstTime) reason = 'First-time customer';
    else if (risk) reason = 'High RTO risk';
    const eligible = reason === null;
    orders.push({
      id,
      batch_id: date,
      customer_id: customerId,
      value,
      payment_mode: mode,
      is_first_time: firstTime,
      eligible,
      ineligible_reason: reason,
      rto_risk_flag: risk,
      placed_at: placed,
      dispatch_deadline: deadline,
      lifecycle_state: eligible ? 'eligible' : 'new',
      features: snapshotFor(state, value),
    });
    if (eligible) {
      const d = makeDraws(rng);
      draws.push({ order_id: id, d });
      // Some customers switch to prepaid on their own before dispatch.
      if (d.u_conv < trueConversion(type, 'none', state.delivered_orders, d.u_noise)) {
        pending.push({
          due_at: placed + (1 + 20 * d.u_time) * HOUR,
          kind: 'conversion',
          order_id: id,
          send_id: null,
          payload: { via: 'organic', discount: 0 },
        });
      }
    }
  };

  for (const c of pool) addOrder(Number(c.id), customerStateFromRow(c, atMs), c.hidden_type, false);
  for (const c of newCustomers) addOrder(c.id, c.state, c.type, true);

  const cod = orders.filter((o) => o.payment_mode === 'cod').length;
  const eligibleCount = orders.filter((o) => o.eligible).length;
  await db.query(
    `insert into order_batches (id, merchant_id, sim_date, is_pilot, total_orders, cod_orders, eligible_orders, arrived_at)
     values ($1, $2, $3::date, false, $4, $5, $6, $7)`,
    [date, MERCHANT_ID, date, orders.length, cod, eligibleCount, iso(atMs)],
  );
  for (let i = 0; i < orders.length; i += 2500) await insertOrders(db, orders.slice(i, i + 2500));
  await insertDraws(db, draws);
  await insertPending(db, pending);
  return { date, total: orders.length, cod, eligible: eligibleCount };
}

/** Resolve everything due up to `untilMs`: engagement events, conversions, dispatch, outcomes. */
export async function resolveUntil(db: Db, untilMs: number): Promise<{ events: number; conversions: number; dispatched: number; outcomes: number }> {
  const until = iso(untilMs);

  // 1. engagement events and conversions
  const due = await db.query(
    `delete from sim_pending where due_at <= $1 and kind in ('event', 'conversion') returning *`,
    [until],
  );
  const evs = due.filter((r) => r.kind === 'event');
  const convs = due.filter((r) => r.kind === 'conversion');
  if (evs.length) {
    await db.query(
      `insert into events (send_id, order_id, merchant_id, type, at)
       select sid, oid, ${MERCHANT_ID}, ty::event_type, at from unnest($1::bigint[], $2::bigint[], $3::text[], $4::timestamptz[]) as t(sid, oid, ty, at)`,
      [evs.map((e) => e.send_id), evs.map((e) => e.order_id), evs.map((e) => e.payload.type), evs.map((e) => e.due_at)],
    );
    const delivered = evs.filter((e) => e.payload.type === 'delivered').map((e) => e.send_id);
    if (delivered.length) await db.query(`update sends set status = 'delivered' where id = any($1::bigint[])`, [delivered]);
  }
  let conversions = 0;
  if (convs.length) {
    const converted = await db.query(
      `update orders o set converted_at = t.at, converted_via = t.via::conversion_via, discount_paid = t.disc,
         lifecycle_state = 'converted'
       from unnest($1::bigint[], $2::timestamptz[], $3::text[], $4::numeric[]) as t(oid, at, via, disc)
       where o.id = t.oid and o.converted_at is null and not o.dispatched
       returning o.id, o.dispatch_deadline, t.via`,
      [convs.map((c) => c.order_id), convs.map((c) => c.due_at), convs.map((c) => c.payload.via), convs.map((c) => c.payload.discount ?? 0)],
    );
    conversions = converted.length;
    const ids = new Set(converted.map((r) => Number(r.id)));
    const withSend = convs.filter((c) => c.send_id && ids.has(Number(c.order_id)));
    if (withSend.length) {
      await db.query(
        `insert into events (send_id, order_id, merchant_id, type, at)
         select sid, oid, ${MERCHANT_ID}, 'converted', at from unnest($1::bigint[], $2::bigint[], $3::timestamptz[]) as t(sid, oid, at)`,
        [withSend.map((c) => c.send_id), withSend.map((c) => c.order_id), withSend.map((c) => c.due_at)],
      );
    }
    if (converted.length) {
      const dr = await db.query(`select order_id, u_rto, u_time from sim_draws where order_id = any($1::bigint[])`, [
        converted.map((r) => r.id),
      ]);
      const dmap = new Map(dr.map((r) => [Number(r.order_id), r]));
      const outcomes: Pending[] = converted.map((r) => {
        const d = dmap.get(Number(r.id))!;
        const rto = Number(d.u_rto) < prepaidRtoRate(r.via === 'discount');
        return {
          due_at: Date.parse(r.dispatch_deadline) + (2 + 2 * Number(d.u_time)) * DAY,
          kind: 'outcome',
          order_id: Number(r.id),
          send_id: null,
          payload: { final: rto ? 'rto' : 'delivered' },
        };
      });
      await insertPending(db, outcomes);
    }
  }

  // 2. dispatch: the conversion window closes; cancellations happen; COD orders ship
  const toDispatch = await db.query(
    `select o.id, o.dispatch_deadline, o.converted_at, o.send_count, o.features, t.hidden_type,
       d.u_conv, d.u_conv2, d.u_cancel, d.u_rto, d.u_time, d.u_noise, d.u_open, d.u_click,
       ls.action as last_action, ls.attempt as last_attempt
     from orders o
     join customers c on c.id = o.customer_id
     join customer_truth t on t.customer_id = c.id
     join sim_draws d on d.order_id = o.id
     left join lateral (select s.action, s.attempt from sends s where s.order_id = o.id order by s.sent_at desc, s.id desc limit 1) ls on true
     where o.eligible and not o.dispatched and o.dispatch_deadline <= $1`,
    [until],
  );
  const cancelIds: number[] = [];
  const cancelAt: string[] = [];
  const codIds: number[] = [];
  const codSent: boolean[] = [];
  const convIds: number[] = [];
  const outcomePending: Pending[] = [];
  for (const o of toDispatch) {
    if (o.converted_at) {
      convIds.push(Number(o.id));
      continue;
    }
    const f = o.features;
    const action: Action = (o.last_action as Action) ?? 'none';
    const attempt = Number(o.last_attempt ?? 1);
    const d = o as unknown as Draws;
    const pConv = trueConversion(o.hidden_type, action, Number(f.delivered_orders), Number(d.u_noise), attempt);
    const messaged = Number(o.send_count) > 0;
    if (cancels(o.hidden_type, messaged, pConv, d)) {
      cancelIds.push(Number(o.id));
      cancelAt.push(o.dispatch_deadline);
      continue;
    }
    const rc = codRtoRate({
      city_tier: Number(f.city_tier),
      past_delivery_issue: Boolean(f.past_delivery_issue),
      delivered_orders: Number(f.delivered_orders),
    });
    const rto = Number(d.u_rto) < rc;
    codIds.push(Number(o.id));
    codSent.push(messaged);
    outcomePending.push({
      due_at: Date.parse(o.dispatch_deadline) + (2 + 2 * Number(d.u_time)) * DAY,
      kind: 'outcome',
      order_id: Number(o.id),
      send_id: null,
      payload: { final: rto ? 'rto' : 'delivered' },
    });
  }
  if (convIds.length) await db.query(`update orders set dispatched = true where id = any($1::bigint[])`, [convIds]);
  if (cancelIds.length) {
    await db.query(
      `update orders o set dispatched = true, final_outcome = 'cancelled', outcome_at = t.at, lifecycle_state = 'cancelled'
       from unnest($1::bigint[], $2::timestamptz[]) as t(oid, at) where o.id = t.oid`,
      [cancelIds, cancelAt],
    );
  }
  if (codIds.length) {
    await db.query(
      `update orders o set dispatched = true,
         lifecycle_state = case when t.sent then 'not_converted'::lifecycle_state else o.lifecycle_state end
       from unnest($1::bigint[], $2::boolean[]) as t(oid, sent) where o.id = t.oid`,
      [codIds, codSent],
    );
  }
  await insertPending(db, outcomePending);
  // Any pending organic conversion after dispatch can no longer happen.
  await db.query(
    `delete from sim_pending p using orders o where p.order_id = o.id and p.kind = 'conversion' and o.dispatched`,
  );

  // 3. delivered / RTO outcomes
  const outs = await db.query(`delete from sim_pending where due_at <= $1 and kind = 'outcome' returning *`, [until]);
  if (outs.length) {
    const updated = await db.query(
      `update orders o set final_outcome = t.fo::final_outcome, outcome_at = t.at, lifecycle_state = t.fo::lifecycle_state
       from unnest($1::bigint[], $2::text[], $3::timestamptz[]) as t(oid, fo, at)
       where o.id = t.oid and o.final_outcome is null
       returning o.customer_id, o.converted_at, o.placed_at, t.fo`,
      [outs.map((r) => r.order_id), outs.map((r) => r.payload.final), outs.map((r) => r.due_at)],
    );
    if (updated.length) {
      await db.query(
        `update customers c set
           total_orders = c.total_orders + 1,
           delivered_orders = c.delivered_orders + case when t.fo = 'delivered' then 1 else 0 end,
           rto_count = c.rto_count + case when t.fo = 'rto' then 1 else 0 end,
           prepaid_orders = c.prepaid_orders + case when t.prepaid then 1 else 0 end,
           cod_orders = c.cod_orders + case when t.prepaid then 0 else 1 end,
           last_order_at = greatest(coalesce(c.last_order_at, t.placed), t.placed)
         from unnest($1::int[], $2::text[], $3::boolean[], $4::timestamptz[]) as t(cid, fo, prepaid, placed)
         where c.id = t.cid`,
        [
          updated.map((r) => r.customer_id),
          updated.map((r) => r.fo),
          updated.map((r) => r.converted_at != null),
          updated.map((r) => r.placed_at),
        ],
      );
    }
  }
  return { events: evs.length, conversions, dispatched: toDispatch.length, outcomes: outs.length };
}

export interface SentOrder {
  order_id: number;
  send_id: number;
  action: 'nudge' | 'discount';
  attempt: number;
  channel: 'whatsapp' | 'mobile_inbox';
  discount: number;
  deadline: number;
  hidden_type: HiddenType;
  delivered_orders: number;
  draws: Draws;
}

/** Simulate what happens after a send: delivered, opened, clicked, converted (same sim day, before dispatch). */
export async function simulateSends(db: Db, sent: SentOrder[], sentAtMs: number, rng: Rng = defaultRng): Promise<void> {
  if (!sent.length) return;
  // The message now drives behaviour; drop any self-conversion that had not happened yet.
  await db.query(`delete from sim_pending where kind = 'conversion' and order_id = any($1::bigint[])`, [
    sent.map((s) => s.order_id),
  ]);
  const pending: Pending[] = [];
  for (const s of sent) {
    const latest = s.deadline - 5 * 60_000;
    const cap = (t: number) => Math.min(t, latest);
    const conv = converts(s.hidden_type, s.action, s.delivered_orders, s.draws, s.attempt);
    // resend: fresh draws for engagement
    const d = s.attempt >= 2 ? { ...s.draws, u_open: rng(), u_click: rng() } : s.draws;
    const eng = engagement(conv, s.channel, d);
    const tDelivered = cap(sentAtMs + 60_000);
    pending.push({ due_at: tDelivered, kind: 'event', order_id: s.order_id, send_id: s.send_id, payload: { type: 'delivered' } });
    if (eng.opened) {
      const tOpen = cap(tDelivered + uniform(rng, 0.1, 3) * HOUR);
      pending.push({ due_at: tOpen, kind: 'event', order_id: s.order_id, send_id: s.send_id, payload: { type: 'opened' } });
      if (eng.clicked) {
        const tClick = cap(tOpen + uniform(rng, 0.03, 0.5) * HOUR);
        pending.push({ due_at: tClick, kind: 'event', order_id: s.order_id, send_id: s.send_id, payload: { type: 'clicked' } });
        if (conv) {
          const tConv = cap(tClick + uniform(rng, 0.02, 0.3) * HOUR);
          pending.push({
            due_at: tConv,
            kind: 'conversion',
            order_id: s.order_id,
            send_id: s.send_id,
            payload: { via: s.action, discount: s.action === 'discount' ? s.discount : 0 },
          });
        }
      }
    }
  }
  await insertPending(db, pending);
}

