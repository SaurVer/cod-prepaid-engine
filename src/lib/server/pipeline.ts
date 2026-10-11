// Runs: create → score (predictions) → decide (decisions) → draft (messages) → review → approve & send.
// Each step writes its own table and processes ~200 orders per call so progress and ETA are real.

import { type Action, decide } from '../core/decide.ts';
import { type DraftOrder, hintFor } from '../core/llm.ts';
import { predictAll, toVector } from '../core/model.ts';
import type { Draws } from '../core/sim.ts';
import type { Db } from './db.ts';
import { draftMessages } from './llm-client.ts';
import { loadModel } from './model.ts';
import {
  type SettingsSnapshot,
  MERCHANT_ID,
  audit,
  economicsFor,
  getMerchant,
  getMerchantSettings,
  getSystemSettings,
  messageCost,
  notify,
  orderCode,
} from './settings.ts';
import { simulateSends } from './simulation.ts';

export const CHUNK = 200;
const W_SCORE = 1;
const W_DECIDE = 1;
const W_DRAFT = 20; // an LLM draft takes far longer than a score or a decision

export class UserError extends Error {}

/** Orders that a new run would take from the chosen batches (new eligible orders only). */
async function newEligibleIds(db: Db, batchIds: string[]): Promise<number[]> {
  const rows = await db.query(
    `select o.id from orders o, system_settings s
     where s.id = 1 and o.batch_id = any($1::text[]) and o.eligible and o.lifecycle_state = 'eligible'
       and o.converted_at is null and not o.dispatched and o.dispatch_deadline > s.sim_now
       and not exists (select 1 from run_orders r where r.order_id = o.id)
     order by o.id`,
    [batchIds],
  );
  return rows.map((r) => Number(r.id));
}

export async function batchesForRun(db: Db) {
  return db.query(
    `select b.id, b.sim_date, b.total_orders, b.cod_orders, b.eligible_orders, b.arrived_at,
       count(o.id) filter (where o.eligible and o.lifecycle_state = 'eligible' and o.converted_at is null
         and not o.dispatched and o.dispatch_deadline > s.sim_now) as available,
       count(o.id) filter (where exists (select 1 from run_orders r where r.order_id = o.id)) as worked_on,
       count(o.id) filter (where o.send_count > 0) as sent,
       count(o.id) filter (where o.eligible and o.converted_at is not null and o.send_count = 0) as self_converted,
       bool_and(o.dispatched) filter (where o.eligible) as closed
     from order_batches b
     join system_settings s on s.id = 1
     left join orders o on o.batch_id = b.id
     where not b.is_pilot
     group by b.id, s.sim_now
     order by b.sim_date desc
     limit 14`,
  );
}

export async function previewRun(db: Db, batchIds: string[]) {
  const ids = await newEligibleIds(db, batchIds);
  const ms = await getMerchantSettings(db);
  const sys = await getSystemSettings(db);
  return {
    orders: ids.length,
    model_version: ms.active_model_version,
    settings: {
      discount_amount: Number(ms.discount_amount),
      max_discount: Number(ms.max_discount),
      holdout_pct: Number(ms.holdout_pct),
      exploration_pct: Number(sys?.exploration_pct ?? 0),
    },
  };
}

export async function createRun(db: Db, opts: { batchIds: string[]; role: string }) {
  if (!opts.batchIds.length) throw new UserError('Choose at least one batch.');
  return db.tx(async (t) => {
    const ids = await newEligibleIds(t, opts.batchIds);
    if (!ids.length) throw new UserError('No new eligible orders in the selected batches.');
    const ms = await getMerchantSettings(t);
    const sys = (await getSystemSettings(t))!;
    if (!ms.active_model_version) throw new UserError('No active model.');
    const snapshot: SettingsSnapshot = { ...ms, exploration_pct: Number(sys.exploration_pct) };
    const [{ next }] = await t.query(`select coalesce(max(id), 0) + 1 as next from runs`);
    const id = Number(next);
    await t.query(
      `insert into runs (id, merchant_id, created_by_role, created_at, source_batch_ids, includes_resends, status,
         order_count, model_version, settings_snapshot)
       values ($1, $2, $3, $4, $5::text[], false, 'queued', $6, $7, $8::jsonb)`,
      [id, MERCHANT_ID, opts.role, sys.sim_now, opts.batchIds, ids.length, ms.active_model_version, JSON.stringify(snapshot)],
    );
    await t.query(
      `insert into run_orders (run_id, order_id, merchant_id, seq)
       select $1, oid, ${MERCHANT_ID}, ord from unnest($2::bigint[]) with ordinality as t(oid, ord)`,
      [id, ids],
    );
    await t.query(`update orders set lifecycle_state = 'in_run' where id = any($1::bigint[])`, [ids]);
    await audit(t, opts.role, 'authorise_run', `run:${id}`, null, {
      batches: opts.batchIds,
      orders: ids.length,
      model_version: ms.active_model_version,
    });
    return { id, orders: ids.length };
  });
}

function weightedProgress(r: any) {
  const n = Number(r.order_count);
  const decidedAll = Number(r.decided_count) >= n;
  const draftTotal = decidedAll ? Number(r.draft_total) : Math.round(0.85 * n);
  const total = n * W_SCORE + n * W_DECIDE + draftTotal * W_DRAFT;
  const done =
    Number(r.scored_count) * W_SCORE + Number(r.decided_count) * W_DECIDE + Number(r.drafted_count) * W_DRAFT;
  return { total: Math.max(1, total), done };
}

async function updateProgress(db: Db, runId: number, status: string) {
  const [r] = await db.query(`select * from runs where id = $1`, [runId]);
  const { total, done } = weightedProgress(r);
  const progress = status === 'ready_for_review' ? 100 : Math.min(99, (100 * done) / total);
  const elapsed = (Date.now() - Date.parse(r.started_real_at)) / 1000;
  const eta = status === 'ready_for_review' || done === 0 ? null : Math.round(((total - done) * elapsed) / done);
  await db.query(
    `update runs set status = $2::run_status, progress = $3, eta_seconds = $4, lease_until = null,
       finished_real_at = case when $2 = 'ready_for_review' then now() else finished_real_at end
     where id = $1`,
    [runId, status, progress.toFixed(2), eta],
  );
}

/** Process the next chunk of the oldest active run. Safe to call from several tabs at once. */
export async function processNext(db: Db): Promise<{ run_id: number | null; status: string; busy?: boolean }> {
  const claimed = await db.query(
    `update runs r set lease_until = now() + interval '90 seconds',
       status = case when r.status = 'queued' then 'scoring'::run_status else r.status end,
       started_real_at = coalesce(r.started_real_at, now())
     where r.id = (select id from runs where not is_pilot and status in ('queued', 'scoring', 'deciding', 'drafting') order by id limit 1)
       and (r.lease_until is null or r.lease_until < now())
     returning *`,
  );
  if (!claimed.length) {
    const active = await db.query(
      `select id, status from runs where not is_pilot and status in ('queued', 'scoring', 'deciding', 'drafting') order by id limit 1`,
    );
    return active.length ? { run_id: Number(active[0].id), status: active[0].status, busy: true } : { run_id: null, status: 'idle' };
  }
  const run = claimed[0];
  const runId = Number(run.id);
  try {
    let status: string = run.status;
    if (status === 'scoring') status = await scoreChunk(db, run);
    else if (status === 'deciding') status = await decideChunk(db, run);
    else if (status === 'drafting') status = await draftChunk(db, run);
    await updateProgress(db, runId, status);
    if (status === 'ready_for_review') {
      const [r] = await db.query(`select order_count from runs where id = $1`, [runId]);
      await notify(
        db,
        'run_ready',
        `Run #${runId} ready for review: ${Number(r.order_count).toLocaleString('en-IN')} orders`,
        `/runs/${runId}`,
      );
    }
    return { run_id: runId, status };
  } catch (e) {
    await db.query(`update runs set lease_until = null where id = $1`, [runId]);
    throw e;
  }
}

async function scoreChunk(db: Db, run: any): Promise<string> {
  const rows = await db.query(
    `select ro.order_id, o.features from run_orders ro join orders o on o.id = ro.order_id
     where ro.run_id = $1 and not exists (select 1 from predictions p where p.run_id = ro.run_id and p.order_id = ro.order_id)
     order by ro.seq limit $2`,
    [run.id, CHUNK],
  );
  if (rows.length) {
    const model = await loadModel(db, Number(run.model_version));
    const preds = rows.map((r) => predictAll(model, toVector(r.features)));
    const col = (f: (i: number) => number) => rows.map((_, i) => Number(f(i).toFixed(6)));
    await db.query(
      `insert into predictions (run_id, order_id, merchant_id, model_version,
         p_convert_none, p_convert_nudge, p_convert_discount, p_cancel_none, p_cancel_nudge, p_cancel_discount,
         r_cod_none, r_cod_nudge, r_cod_discount, r_pre_none, r_pre_nudge, r_pre_discount)
       select $1, oid, ${MERCHANT_ID}, $2, a, b, c, d, e, f, g, h, i, j, k, l
       from unnest($3::bigint[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[],
         $10::numeric[], $11::numeric[], $12::numeric[], $13::numeric[], $14::numeric[], $15::numeric[])
         as t(oid, a, b, c, d, e, f, g, h, i, j, k, l)`,
      [
        run.id,
        run.model_version,
        rows.map((r) => r.order_id),
        col((i) => preds[i].none.p),
        col((i) => preds[i].nudge.p),
        col((i) => preds[i].discount.p),
        col((i) => preds[i].none.k),
        col((i) => preds[i].nudge.k),
        col((i) => preds[i].discount.k),
        col((i) => preds[i].none.rc),
        col((i) => preds[i].nudge.rc),
        col((i) => preds[i].discount.rc),
        col((i) => preds[i].none.rp),
        col((i) => preds[i].nudge.rp),
        col((i) => preds[i].discount.rp),
      ],
    );
    await db.query(`update runs set scored_count = scored_count + $2 where id = $1`, [run.id, rows.length]);
  }
  const [r] = await db.query(`select scored_count, order_count from runs where id = $1`, [run.id]);
  return Number(r.scored_count) >= Number(r.order_count) ? 'deciding' : 'scoring';
}

async function decideChunk(db: Db, run: any): Promise<string> {
  const snap = run.settings_snapshot as SettingsSnapshot;
  const rows = await db.query(
    `select p.*, o.features from predictions p
     join run_orders ro on ro.run_id = p.run_id and ro.order_id = p.order_id
     join orders o on o.id = p.order_id
     where p.run_id = $1 and not exists (select 1 from decisions d where d.run_id = p.run_id and d.order_id = p.order_id)
     order by ro.seq limit $2`,
    [run.id, CHUNK],
  );
  if (rows.length) {
    const out = rows.map((r) => {
      const econ = economicsFor(snap, r.features.channel);
      const draws = { uGroup: Math.random(), uExplore: Math.random() };
      const probs = {
        none: { p: r.p_convert_none, k: r.p_cancel_none, rc: r.r_cod_none, rp: r.r_pre_none },
        nudge: { p: r.p_convert_nudge, k: r.p_cancel_nudge, rc: r.r_cod_nudge, rp: r.r_pre_nudge },
        discount: { p: r.p_convert_discount, k: r.p_cancel_discount, rc: r.r_cod_discount, rp: r.r_pre_discount },
      };
      for (const a of ['none', 'nudge', 'discount'] as Action[]) {
        for (const k of ['p', 'k', 'rc', 'rp'] as const) probs[a][k] = Number(probs[a][k]);
      }
      const d = decide({
        probs,
        econ,
        holdoutPct: Number(snap.holdout_pct),
        explorationPct: Number(snap.exploration_pct),
        draws,
      });
      const detail = {
        econ,
        holdout_pct: Number(snap.holdout_pct),
        exploration_pct: Number(snap.exploration_pct),
        draws,
        discount_available: d.discountAvailable,
        breakdown: d.breakdown,
      };
      return { order_id: Number(r.order_id), d, detail, mcost: d.chosen === 'none' ? 0 : econ.messageCost };
    });
    const r4 = (x: number) => Number(x.toFixed(4));
    await db.query(
      `insert into decisions (run_id, order_id, merchant_id, ev_none, ev_nudge, ev_discount, gain_nudge, gain_discount,
         chosen_action, reason_code, discount_applied, message_cost, detail)
       select $1, oid, ${MERCHANT_ID}, en, eu, ed, gu, gd, ca::action_type, rc::reason_code, da, mc, dt::jsonb
       from unnest($2::bigint[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::text[],
         $9::text[], $10::numeric[], $11::numeric[], $12::text[]) as t(oid, en, eu, ed, gu, gd, ca, rc, da, mc, dt)`,
      [
        run.id,
        out.map((o) => o.order_id),
        out.map((o) => r4(o.d.ev.none)),
        out.map((o) => r4(o.d.ev.nudge)),
        out.map((o) => r4(o.d.ev.discount)),
        out.map((o) => r4(o.d.gain.nudge)),
        out.map((o) => r4(o.d.gain.discount)),
        out.map((o) => o.d.chosen),
        out.map((o) => o.d.reason),
        out.map((o) => o.d.discountApplied),
        out.map((o) => o.mcost),
        out.map((o) => JSON.stringify(o.detail)),
      ],
    );
    await db.query(
      `update run_orders ro set assignment_group = t.g::assignment_group
       from unnest($2::bigint[], $3::text[]) as t(oid, g) where ro.run_id = $1 and ro.order_id = t.oid`,
      [run.id, out.map((o) => o.order_id), out.map((o) => o.d.group)],
    );
    await db.query(
      `update orders o set lifecycle_state = t.s::lifecycle_state
       from unnest($1::bigint[], $2::text[]) as t(oid, s) where o.id = t.oid and o.converted_at is null and not o.dispatched`,
      [out.map((o) => o.order_id), out.map((o) => (o.d.group === 'holdout' ? 'holdout' : 'decided'))],
    );
    await db.query(`update runs set decided_count = decided_count + $2 where id = $1`, [run.id, rows.length]);
  }
  const [r] = await db.query(`select decided_count, order_count from runs where id = $1`, [run.id]);
  if (Number(r.decided_count) < Number(r.order_count)) return 'deciding';
  const [c] = await db.query(
    `select count(*)::int as n from decisions where run_id = $1 and chosen_action <> 'none'`,
    [run.id],
  );
  await db.query(`update runs set draft_total = $2 where id = $1`, [run.id, c.n]);
  return Number(c.n) > 0 ? 'drafting' : 'ready_for_review';
}

async function draftChunk(db: Db, run: any): Promise<string> {
  const rows = await db.query(
    `select d.order_id, d.chosen_action, d.discount_applied, o.features, c.last_category
     from decisions d
     join run_orders ro on ro.run_id = d.run_id and ro.order_id = d.order_id
     join orders o on o.id = d.order_id
     join customers c on c.id = o.customer_id
     where d.run_id = $1 and d.chosen_action <> 'none'
       and not exists (select 1 from messages m where m.run_id = d.run_id and m.order_id = d.order_id)
     order by ro.seq limit $2`,
    [run.id, CHUNK],
  );
  if (rows.length) {
    const merchant = (await getMerchant(db))!;
    const drafts: DraftOrder[] = rows.map((r) => ({
      order_id: orderCode(r.order_id),
      action: r.chosen_action,
      discount: Number(r.discount_applied),
      hint: hintFor(Boolean(r.features.past_delivery_issue)),
      delivered_orders: Number(r.features.delivered_orders),
      last_category: r.last_category,
      channel: r.features.channel,
    }));
    const results = await draftMessages(drafts, merchant.name, merchant.tone_guide);
    await db.query(
      `insert into messages (run_id, order_id, merchant_id, channel, llm_prompt, llm_output, final_text, variant_tag, fallback_used)
       select $1, oid, ${MERCHANT_ID}, ch::channel_type, pr, ou, tx, vt::variant_tag, fb
       from unnest($2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::boolean[])
         as t(oid, ch, pr, ou, tx, vt, fb)
       on conflict (run_id, order_id) do nothing`,
      [
        run.id,
        rows.map((r) => r.order_id),
        rows.map((r) => r.features.channel),
        results.map((r) => r.prompt),
        results.map((r) => r.output),
        results.map((r) => r.text),
        results.map((r) => r.variant),
        results.map((r) => r.fallback),
      ],
    );
    await db.query(
      `update orders set lifecycle_state = 'message_drafted'
       where id = any($1::bigint[]) and converted_at is null and not dispatched`,
      [rows.map((r) => r.order_id)],
    );
  }
  const [{ n }] = await db.query(`select count(*)::int as n from messages where run_id = $1`, [run.id]);
  await db.query(`update runs set drafted_count = $2 where id = $1`, [run.id, n]);
  const [r] = await db.query(`select draft_total from runs where id = $1`, [run.id]);
  return Number(n) >= Number(r.draft_total) ? 'ready_for_review' : 'drafting';
}

// ---------- review, edit, approve & send ----------

/** Messages that would go out on approval right now. */
async function sendable(db: Db, runId: number) {
  return db.query(
    `select m.id as message_id, m.order_id, m.channel, d.chosen_action, d.discount_applied, o.dispatch_deadline,
       o.features, o.send_count, t.hidden_type, sd.u_conv, sd.u_conv2, sd.u_cancel, sd.u_rto, sd.u_open, sd.u_click,
       sd.u_noise, sd.u_time
     from messages m
     join decisions d on d.run_id = m.run_id and d.order_id = m.order_id
     join orders o on o.id = m.order_id
     join customer_truth t on t.customer_id = o.customer_id
     join sim_draws sd on sd.order_id = o.id
     join system_settings s on s.id = 1
     where m.run_id = $1 and m.review <> 'rejected' and not m.approved
       and o.converted_at is null and not o.dispatched and o.dispatch_deadline > s.sim_now + interval '5 minutes'`,
    [runId],
  );
}

export async function approvalSummary(db: Db, runId: number) {
  const rows = await sendable(db, runId);
  const [counts] = await db.query(
    `select
       count(*) filter (where ro.assignment_group = 'holdout')::int as holdout,
       count(m.id) filter (where m.review = 'rejected')::int as rejected,
       count(m.id)::int as drafted
     from run_orders ro left join messages m on m.run_id = ro.run_id and m.order_id = ro.order_id
     where ro.run_id = $1`,
    [runId],
  );
  const discount = rows.filter((r) => r.chosen_action === 'discount');
  return {
    to_message: rows.length,
    nudges: rows.length - discount.length,
    discounts: discount.length,
    discount_exposure: discount.reduce((s, r) => s + Number(r.discount_applied), 0),
    whatsapp: rows.filter((r) => r.channel === 'whatsapp').length,
    mobile_inbox: rows.filter((r) => r.channel === 'mobile_inbox').length,
    holdout: counts.holdout,
    rejected: counts.rejected,
    skipped: Number(counts.drafted) - Number(counts.rejected) - rows.length,
  };
}

export async function approveAndSend(db: Db, runId: number, role: string) {
  if (role !== 'owner') throw new UserError('Only the Owner can approve and send.');
  return db.tx(async (t) => {
    const [run] = await t.query(`select * from runs where id = $1 for update`, [runId]);
    if (!run) throw new UserError('Run not found.');
    if (run.status !== 'ready_for_review') throw new UserError(`Run #${runId} is ${run.status.replace(/_/g, ' ')}, not ready for review.`);
    const summary = await approvalSummary(t, runId);
    const rows = await sendable(t, runId);
    const sys = (await getSystemSettings(t))!;
    const snap = run.settings_snapshot as SettingsSnapshot;
    const sentAt = sys.sim_now;
    let sends: any[] = [];
    if (rows.length) {
      sends = await t.query(
        `insert into sends (run_id, order_id, message_id, merchant_id, channel, action, discount_applied, message_cost, attempt, sent_at)
         select $1, oid, mid, ${MERCHANT_ID}, ch::channel_type, a::action_type, da, mc, att, $2
         from unnest($3::bigint[], $4::bigint[], $5::text[], $6::text[], $7::numeric[], $8::numeric[], $9::int[])
           as t(oid, mid, ch, a, da, mc, att)
         returning id, order_id`,
        [
          runId,
          sentAt,
          rows.map((r) => r.order_id),
          rows.map((r) => r.message_id),
          rows.map((r) => r.channel),
          rows.map((r) => r.chosen_action),
          rows.map((r) => r.discount_applied),
          rows.map((r) => messageCost(snap, r.channel)),
          rows.map((r) => Number(r.send_count) + 1),
        ],
      );
      await t.query(
        `update messages set approved = true, review = 'approved' where id = any($1::bigint[])`,
        [rows.map((r) => r.message_id)],
      );
      await t.query(
        `update orders o set send_count = o.send_count + 1, last_sent_at = $1, lifecycle_state = 'sent',
           message_cost = o.message_cost + t.mc
         from unnest($2::bigint[], $3::numeric[]) as t(oid, mc) where o.id = t.oid`,
        [sentAt, rows.map((r) => r.order_id), rows.map((r) => messageCost(snap, r.channel))],
      );
      const sendId = new Map(sends.map((s) => [Number(s.order_id), Number(s.id)]));
      await simulateSends(
        t,
        rows.map((r) => ({
          order_id: Number(r.order_id),
          send_id: sendId.get(Number(r.order_id))!,
          action: r.chosen_action,
          attempt: Number(r.send_count) + 1,
          channel: r.channel,
          discount: Number(r.discount_applied),
          deadline: Date.parse(r.dispatch_deadline),
          hidden_type: r.hidden_type,
          delivered_orders: Number(r.features.delivered_orders),
          draws: r as unknown as Draws,
        })),
        Date.parse(sentAt),
      );
    }
    await t.query(
      `update runs set status = 'sent', approved_at = $2, approved_by_role = $3::user_role where id = $1`,
      [runId, sentAt, role],
    );
    await audit(t, role, 'approve_and_send', `run:${runId}`, null, summary);
    await notify(
      t,
      'run_sent',
      `Run #${runId} sent: ${rows.length.toLocaleString('en-IN')} messages`,
      `/results?run=${runId}`,
    );
    return { sent: sends.length, summary };
  });
}

export async function editMessage(db: Db, runId: number, orderId: number, text: string, role: string) {
  const clean = text.trim();
  if (!clean) throw new UserError('Message cannot be empty.');
  if (clean.length > 300) throw new UserError('Messages are limited to 300 characters.');
  return db.tx(async (t) => {
    const [m] = await t.query(`select * from messages where run_id = $1 and order_id = $2 for update`, [runId, orderId]);
    if (!m) throw new UserError('Message not found.');
    if (m.approved) throw new UserError('This message has already been sent.');
    await t.query(
      `update messages set edited_text = $3, final_text = $3, edited_at = (select sim_now from system_settings where id = 1)
       where run_id = $1 and order_id = $2`,
      [runId, orderId, clean],
    );
    await audit(t, role, 'edit_message', `run:${runId}/order:${orderId}`, { text: m.final_text }, { text: clean });
    return { ok: true };
  });
}

export async function setReview(db: Db, runId: number, orderIds: number[], review: 'approved' | 'rejected' | 'pending', role: string) {
  if (!orderIds.length) return { updated: 0 };
  const r = await db.query(
    `update messages set review = $3::review_state where run_id = $1 and order_id = any($2::bigint[]) and not approved returning order_id`,
    [runId, orderIds, review],
  );
  await audit(db, role, `review_${review}`, `run:${runId}`, null, { orders: r.length });
  return { updated: r.length };
}
