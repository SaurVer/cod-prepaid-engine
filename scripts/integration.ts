// End-to-end check against a real Postgres (local). Usage:
//   PSQL_TEST_URL=postgres://... node --experimental-strip-types scripts/integration.ts
import assert from 'node:assert/strict';
import { tick } from '../src/lib/server/clock.ts';
import { getDb } from '../src/lib/server/db.ts';
import { approvalSummary, approveAndSend, batchesForRun, createRun, processNext } from '../src/lib/server/pipeline.ts';
import { inspectorOrder, overview, runResults } from '../src/lib/server/results.ts';
import { SEED_STEPS, runSeedStep } from '../src/lib/server/seed.ts';

const db = getDb();
const t0 = Date.now();
const lap = (label: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`);

for (const step of SEED_STEPS) {
  const msg = await runSeedStep(db, step);
  lap(`seed ${step}: ${msg}`);
}

const [sys] = await db.query(`select * from system_settings`);
lap(`sim_now ${sys.sim_now} status ${sys.seed_status}`);
const [mv] = await db.query(`select version, training_rows, metrics from model_versions`);
lap(`model v${mv.version} rows ${mv.training_rows} AUC nudge ${mv.metrics.auc.conv_nudge?.toFixed(3)}`);

const ov = await overview(db);
lap(`overview today ${JSON.stringify(ov.today)} at stake ₹${Math.round(ov.money.at_stake)} per order ₹${ov.money.cod_cost_per_order.toFixed(2)}`);

const batches = await batchesForRun(db);
lap(`batches ${JSON.stringify(batches[0])}`);

const run = await createRun(db, { batchIds: [batches[0].id], role: 'owner' });
lap(`run #${run.id} with ${run.orders} orders`);
let status = 'queued';
let calls = 0;
while (status !== 'ready_for_review' && calls < 100) {
  const r = await processNext(db);
  status = r.status;
  calls++;
}
lap(`run ready after ${calls} chunk calls`);
const [rr] = await db.query(`select status, progress, scored_count, decided_count, drafted_count, draft_total from runs where id = $1`, [run.id]);
lap(`run state ${JSON.stringify(rr)}`);
const groups = await db.query(
  `select ro.assignment_group, d.chosen_action, count(*)::int n from run_orders ro join decisions d using (run_id, order_id) where ro.run_id = $1 group by 1, 2 order by 1, 2`,
  [run.id],
);
lap(`groups ${JSON.stringify(groups)}`);

const summary = await approvalSummary(db, run.id);
lap(`approval summary ${JSON.stringify(summary)}`);
const sent = await approveAndSend(db, run.id, 'owner');
lap(`sent ${sent.sent}`);

// Hard rule: a send to a converted order is rejected by the database.
await tick(db, { advanceDay: true });
lap('advanced 1 day');
const [conv] = await db.query(
  `select o.id, m.id as mid from orders o join messages m on m.order_id = o.id where o.converted_at is not null limit 1`,
);
assert.ok(conv, 'expected at least one converted order');
let rejected = false;
try {
  await db.query(
    `insert into sends (run_id, order_id, message_id, merchant_id, channel, action, sent_at)
     values ($1, $2, $3, 1, 'whatsapp', 'nudge', (select sim_now from system_settings))`,
    [run.id, conv.id, conv.mid],
  );
} catch (e) {
  rejected = /HARD_RULE/.test(String(e));
}
assert.ok(rejected, 'DB must reject a send to a converted order');
lap('hard rule: send to converted order rejected ✓');

let res = await runResults(db, run.id);
lap(`after 1 day funnel ${JSON.stringify(res!.funnel)} model conv ${res!.groups.model.conversion_rate.toFixed(3)} holdout conv ${res!.groups.holdout.conversion_rate.toFixed(3)} incremental ${res!.incremental_per_order}`);

for (let i = 0; i < 5; i++) await tick(db, { advanceDay: true });
res = await runResults(db, run.id);
lap(
  `after 6 days resolved ${(res!.resolved_share * 100).toFixed(0)}% incremental ₹/order ${res!.incremental_per_order?.toFixed(2)} realised ₹${res!.realised_gain?.toFixed(0)} est ₹${res!.estimated_gain_model.toFixed(0)}`,
);
lap(`model ${JSON.stringify(res!.groups.model)}`);
lap(`holdout ${JSON.stringify(res!.groups.holdout)}`);

const [one] = await db.query(`select order_id from decisions where run_id = $1 and chosen_action = 'nudge' limit 1`, [run.id]);
const insp = await inspectorOrder(db, run.id, Number(one.order_id));
lap(`inspector: events ${insp!.events.map((e: any) => e.type).join(',')} outcome ${insp!.row.final_outcome}`);
const [cnt] = await db.query(`select count(*)::int n from order_batches where not is_pilot`);
lap(`live batches: ${cnt.n}`);
