// Runs: create → score (predictions) → decide (decisions) → draft (messages) → review → approve & send.
// Each step writes its own table and processes ~200 orders per call so progress and ETA are real.

import { type Action, decide } from '../core/decide.ts';
import { type DraftOrder, expectedVariant, fallbackText, hintFor } from '../core/llm.ts';
import { predictAll, toVector } from '../core/model.ts';
import type { Draws } from '../core/sim.ts';
import type { Db } from './db.ts';
import { draftMessages } from './llm-client.ts';
import { loadModel } from './model.ts';
import {
  type SettingsSnapshot,
  DEFAULTS,
  HOUR,
  MERCHANT_ID,
  audit,
  economicsFor,
  getMerchant,
  getMerchantSettings,
  getSystemSettings,
  istDate,
  istDayStart,
  messageCost,
  notify,
  orderCode,
} from './settings.ts';
import { resolveUntil, simulateSends } from './simulation.ts';

export const CHUNK = 200;
const W_SCORE = 1;
const W_DECIDE = 1;
const W_DRAFT = 20; // an LLM draft takes far longer than a score or a decision

export { UserError } from './errors.ts';
import { UserError } from './errors.ts';

/** When a campaign on `date` is treated as sent: now for today; 9 PM IST that evening for a past day (a replay). */
export function campaignMoment(date: string, nowMs = Date.now()): { replay: boolean; atMs: number } {
  const today = istDate(nowMs);
  if (date >= today) return { replay: false, atMs: nowMs };
  return { replay: true, atMs: istDayStart(date) + DEFAULTS.history_campaign_hour * HOUR };
}

/** Today: new eligible orders not yet in a campaign and still before their dispatch deadline. */
async function liveCandidates(db: Db, date: string): Promise<number[]> {
  const rows = await db.query(
    `select o.id from orders o, system_settings s
     where s.id = 1 and o.batch_id = $1 and o.eligible and o.lifecycle_state = 'eligible'
       and o.converted_at is null and not o.dispatched and o.dispatch_deadline > s.sim_now
       and not exists (select 1 from run_orders r where r.order_id = o.id)
     order by o.id`,
    [date],
  );
  return rows.map((r) => Number(r.id));
}

/**
 * Past day: eligible orders placed before 9 PM that were never in a campaign and had not paid online.
 * (Orders that switched to prepaid on their own stay converted: a conversion can never be undone.)
 */
async function replayCandidates(db: Db, date: string, atMs: number): Promise<number[]> {
  const rows = await db.query(
    `select o.id from orders o
     where o.batch_id = $1 and o.eligible and o.converted_at is null and o.placed_at < $2
       and not exists (select 1 from run_orders r where r.order_id = o.id)
     order by o.id`,
    [date, new Date(atMs).toISOString()],
  );
  return rows.map((r) => Number(r.id));
}

/** Orders a campaign on this date would take right now. */
export async function campaignCandidates(db: Db, date: string): Promise<{ replay: boolean; atMs: number; ids: number[] }> {
  const m = campaignMoment(date);
  const ids = m.replay ? await replayCandidates(db, date, m.atMs) : await liveCandidates(db, date);
  return { ...m, ids };
}

/**
 * Put past-day orders back to how they were at 9 PM that day: not yet shipped, no delivery outcome.
 * Customer history counters that the outcome had updated are rolled back too.
 */
async function rewindOrders(db: Db, ids: number[]) {
  await db.query(
    `update customers c set
       total_orders = greatest(0, c.total_orders - x.n),
       delivered_orders = greatest(0, c.delivered_orders - x.d),
       rto_count = greatest(0, c.rto_count - x.r),
       cod_orders = greatest(0, c.cod_orders - x.n)
     from (select customer_id, count(*) as n,
             count(*) filter (where final_outcome = 'delivered') as d,
             count(*) filter (where final_outcome = 'rto') as r
           from orders where id = any($1::bigint[]) and final_outcome in ('delivered', 'rto') group by 1) x
     where c.id = x.customer_id`,
    [ids],
  );
  await db.query(`delete from sim_pending where order_id = any($1::bigint[])`, [ids]);
  await db.query(
    `update orders set dispatched = false, final_outcome = null, outcome_at = null, lifecycle_state = 'eligible'
     where id = any($1::bigint[])`,
    [ids],
  );
}

export interface CreateRunOptions {
  date: string;
  role: string;
  /** share of orders kept as the no-message control group (0.01–0.5) */
  holdoutPct?: number;
  /** share of orders given a random nudge or discount for training (0–0.5) */
  explorePct?: number;
}

function checkSplit(holdout: number, explore: number) {
  if (!Number.isFinite(holdout) || holdout < 0.01 || holdout > 0.5) throw new UserError('Control group must be between 1% and 50%.');
  if (!Number.isFinite(explore) || explore < 0 || explore > 0.5) throw new UserError('Random test must be between 0% and 50%.');
  if (holdout + explore > 0.6) throw new UserError('Control + random test can be at most 60%, so the model still decides most orders.');
}

export async function createRun(db: Db, opts: CreateRunOptions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date ?? '')) throw new UserError('Choose a day.');
  return db.tx(async (t) => {
    // Same lock as sync(), so new orders and outcomes are not resolved halfway through a replay.
    await t.query(`select pg_advisory_xact_lock(4242)`);
    const ms = await getMerchantSettings(t);
    const sys = (await getSystemSettings(t))!;
    if (!ms.active_model_version) throw new UserError('No active model.');
    const holdout = opts.holdoutPct ?? Number(ms.holdout_pct);
    const explore = opts.explorePct ?? Number(sys.exploration_pct);
    checkSplit(holdout, explore);
    const { replay, atMs, ids } = await campaignCandidates(t, opts.date);
    if (!ids.length) {
      throw new UserError(
        replay ? 'Every order on this day has already been in a campaign.' : 'No new orders are ready for a campaign right now.',
      );
    }
    const at = replay ? new Date(atMs).toISOString() : sys.sim_now;
    const snapshot: SettingsSnapshot = {
      ...ms,
      holdout_pct: holdout,
      exploration_pct: explore,
      replay,
      campaign_at: at,
      date: opts.date,
    };
    const [{ next }] = await t.query(`select coalesce(max(id), 0) + 1 as next from runs`);
    const id = Number(next);
    await t.query(
      `insert into runs (id, merchant_id, created_by_role, created_at, source_batch_ids, includes_resends, status,
         order_count, model_version, settings_snapshot)
       values ($1, $2, $3, $4, $5::text[], false, 'queued', $6, $7, $8::jsonb)`,
      [id, MERCHANT_ID, opts.role, at, [opts.date], ids.length, ms.active_model_version, JSON.stringify(snapshot)],
    );
    if (replay) {
      await rewindOrders(t, ids);
      // The hard-rule trigger checks deadlines against engine time, so evaluate it at 9 PM that day.
      await t.query(`update system_settings set sim_now = $1 where id = 1`, [at]);
    }
    await t.query(
      `insert into run_orders (run_id, order_id, merchant_id, seq)
       select $1, oid, ${MERCHANT_ID}, ord from unnest($2::bigint[]) with ordinality as t(oid, ord)`,
      [id, ids],
    );
    if (replay) await t.query(`update system_settings set sim_now = $1 where id = 1`, [sys.sim_now]);
    await t.query(`update orders set lifecycle_state = 'in_run' where id = any($1::bigint[])`, [ids]);
    await audit(t, opts.role, 'authorise_run', `run:${id}`, null, {
      date: opts.date,
      replay,
      orders: ids.length,
      control_pct: holdout,
      random_test_pct: explore,
      model_version: ms.active_model_version,
    });
    return { id, orders: ids.length, href: campaignHref(id), name: campaignName(at), replay };
  });
}

export function campaignHref(runId: number): string {
  return `/campaigns/${runId}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Campaign · 11 Oct, 5:40 PM" in IST */
export function campaignName(createdAt: string): string {
  const d = new Date(Date.parse(createdAt) + 5.5 * 3600_000);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `Campaign · ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ampm}`;
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
export interface ProcessOptions {
  /** orders per call (default ~200) */
  chunk?: number;
  /** use fixed templates instead of LLM calls (seeded history) */
  template?: boolean;
  /** no notifications (seeded history) */
  quiet?: boolean;
}

export async function processNext(db: Db, opts: ProcessOptions = {}): Promise<{ run_id: number | null; status: string; busy?: boolean }> {
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
    const chunk = opts.chunk ?? CHUNK;
    if (status === 'scoring') status = await scoreChunk(db, run, chunk);
    else if (status === 'deciding') status = await decideChunk(db, run, chunk);
    else if (status === 'drafting') status = await draftChunk(db, run, chunk, Boolean(opts.template));
    await updateProgress(db, runId, status);
    if (status === 'ready_for_review' && !opts.quiet) {
      const [r] = await db.query(`select order_count, created_at, source_batch_ids from runs where id = $1`, [runId]);
      await notify(
        db,
        'run_ready',
        `${campaignName(r.created_at)} is ready to review: ${Number(r.order_count).toLocaleString('en-IN')} orders`,
        campaignHref(runId),
      );
    }
    return { run_id: runId, status };
  } catch (e) {
    await db.query(`update runs set lease_until = null where id = $1`, [runId]);
    throw e;
  }
}

async function scoreChunk(db: Db, run: any, chunk: number): Promise<string> {
  const rows = await db.query(
    `select ro.order_id, o.features from run_orders ro join orders o on o.id = ro.order_id
     where ro.run_id = $1 and not exists (select 1 from predictions p where p.run_id = ro.run_id and p.order_id = ro.order_id)
     order by ro.seq limit $2`,
    [run.id, chunk],
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

async function decideChunk(db: Db, run: any, chunk: number): Promise<string> {
  const snap = run.settings_snapshot as SettingsSnapshot;
  const rows = await db.query(
    `select p.*, o.features from predictions p
     join run_orders ro on ro.run_id = p.run_id and ro.order_id = p.order_id
     join orders o on o.id = p.order_id
     where p.run_id = $1 and not exists (select 1 from decisions d where d.run_id = p.run_id and d.order_id = p.order_id)
     order by ro.seq limit $2`,
    [run.id, chunk],
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

async function draftChunk(db: Db, run: any, chunk: number, template: boolean): Promise<string> {
  const rows = await db.query(
    `select d.order_id, d.chosen_action, d.discount_applied, o.features, c.last_category
     from decisions d
     join run_orders ro on ro.run_id = d.run_id and ro.order_id = d.order_id
     join orders o on o.id = d.order_id
     join customers c on c.id = o.customer_id
     where d.run_id = $1 and d.chosen_action <> 'none'
       and not exists (select 1 from messages m where m.run_id = d.run_id and m.order_id = d.order_id)
     order by ro.seq limit $2`,
    [run.id, chunk],
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
    const results = template
      ? drafts.map((d) => {
          const variant = expectedVariant(d);
          return {
            order_id: d.order_id,
            prompt: '(historical campaign: fixed template, no LLM call)',
            output: 'Template (historical campaign)',
            text: fallbackText(variant, merchant.name, d.discount),
            variant,
            fallback: true,
          };
        })
      : await draftMessages(drafts, merchant.name, merchant.tone_guide);
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

/** The moment a run's messages go out: 9 PM that day for a replay, otherwise now. */
function sendMoment(run: any, sys: { sim_now: string }): string {
  const snap = run.settings_snapshot as SettingsSnapshot;
  return snap?.replay && snap.campaign_at ? snap.campaign_at : sys.sim_now;
}

/** Messages that would go out on approval. */
async function sendable(db: Db, runId: number) {
  const [run] = await db.query(`select settings_snapshot from runs where id = $1`, [runId]);
  const sys = (await getSystemSettings(db))!;
  const at = sendMoment(run, sys);
  return db.query(
    `select m.id as message_id, m.order_id, m.channel, d.chosen_action, d.discount_applied, o.dispatch_deadline,
       o.features, o.send_count, t.hidden_type, sd.u_conv, sd.u_conv2, sd.u_cancel, sd.u_rto, sd.u_open, sd.u_click,
       sd.u_noise, sd.u_time
     from messages m
     join decisions d on d.run_id = m.run_id and d.order_id = m.order_id
     join orders o on o.id = m.order_id
     join customer_truth t on t.customer_id = o.customer_id
     join sim_draws sd on sd.order_id = o.id
     where m.run_id = $1 and m.review <> 'rejected' and not m.approved
       and o.converted_at is null and not o.dispatched and o.dispatch_deadline > $2::timestamptz + interval '5 minutes'`,
    [runId, at],
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

export async function approveAndSend(db: Db, runId: number, role: string, opts: { quiet?: boolean } = {}) {
  if (role !== 'owner') throw new UserError('Only the Owner can approve and send. Use “Request approval” instead.');
  return db.tx(async (t) => {
    await t.query(`select pg_advisory_xact_lock(4242)`);
    const [run] = await t.query(`select * from runs where id = $1 for update`, [runId]);
    if (!run) throw new UserError('Run not found.');
    if (run.status !== 'ready_for_review') throw new UserError(`This campaign is ${run.status.replace(/_/g, ' ')}, not ready to send.`);
    const summary = await approvalSummary(t, runId);
    const rows = await sendable(t, runId);
    const sys = (await getSystemSettings(t))!;
    const snap = run.settings_snapshot as SettingsSnapshot;
    const replay = Boolean(snap?.replay);
    const sentAt = sendMoment(run, sys);
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
        replay ? 'history' : 'live',
      );
    }
    await t.query(
      `update runs set status = 'sent', approved_at = $2, approved_by_role = $3::user_role where id = $1`,
      [runId, sentAt, role],
    );
    // A replayed day already happened: play its responses, shipping and deliveries forward to now.
    if (replay) await resolveUntil(t, Date.now());
    if (!opts.quiet) {
      await audit(t, role, 'approve_and_send', `campaign:${runId}`, null, summary);
      await notify(
        t,
        'run_sent',
        replay
          ? `${campaignName(run.created_at)} replayed: ${rows.length.toLocaleString('en-IN')} messages. Responses and deliveries up to now are already in.`
          : `${campaignName(run.created_at)} sent: ${rows.length.toLocaleString('en-IN')} messages. Customer responses arrive over the next few minutes.`,
        campaignHref(runId),
      );
    }
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

export async function requestApproval(db: Db, runId: number, role: string) {
  const [run] = await db.query(`select * from runs where id = $1`, [runId]);
  if (!run) throw new UserError('Campaign not found.');
  await notify(
    db,
    'approval_request',
    `Approval requested by ${role === 'analyst' ? 'an Analyst' : role}: ${campaignName(run.created_at)}`,
    campaignHref(runId),
  );
  await audit(db, role, 'request_approval', `campaign:${runId}`, null, null);
  return { ok: true };
}
