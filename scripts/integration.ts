// End-to-end check against a real Postgres (local). Usage:
//   PSQL_TEST_URL=postgres://... node --experimental-strip-types scripts/integration.ts
import assert from 'node:assert/strict';
import { getDb } from '../src/lib/server/db.ts';
import { dailyDiagnostics, startRetrain, trainingStep, countNewRandomisedOutcomes } from '../src/lib/server/model.ts';
import { approvalSummary, approveAndSend, createRun, processNext } from '../src/lib/server/pipeline.ts';
import { codCost, daySummaries, runResults } from '../src/lib/server/results.ts';
import { SEED_STEPS, runSeedStep } from '../src/lib/server/seed.ts';
import { sync } from '../src/lib/server/sync.ts';

const db = getDb();
const t0 = Date.now();
const lap = (label: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`);

for (const step of SEED_STEPS) lap(`seed ${step}: ${await runSeedStep(db, step)}`);

let days = await daySummaries(db, 30);
lap(`days: ${days.length}; today ${JSON.stringify({ ...days[0], campaigns: days[0].campaigns.length })}`);
assert.equal(days.filter((d) => d.campaigns.length).length, 0, 'seeded history has no campaigns');
const old = days[10];
lap(`${old.date}: orders ${old.total}, eligible ${old.eligible}, replayable ${old.ready}`);
assert.ok(old.ready > 0.6 * old.eligible, 'most eligible orders on a past day can be replayed');

// live sync adds orders over time
const s1 = await sync(db, Date.now() + 30 * 60_000);
lap(`sync +30min added ${s1.added}`);

// ---- replay a past day ----
const [{ n: custBefore }] = await db.query(`select sum(total_orders)::int as n from customers`);
const rp = await createRun(db, { date: old.date, role: 'owner', holdoutPct: 0.2, explorePct: 0 });
lap(`replay ${rp.name} with ${rp.orders} orders (replay=${rp.replay}) → ${rp.href}`);
assert.equal(rp.orders, old.ready);
// a sync while the campaign is being prepared must not ship the reopened orders
await sync(db, Date.now() + 31 * 60_000);
const [{ shipped }] = await db.query(`select count(*)::int as shipped from run_orders ro join orders o on o.id = ro.order_id where ro.run_id = $1 and o.dispatched`, [rp.id]);
assert.equal(shipped, 0, 'replayed orders wait for the campaign');
for (let i = 0; i < 100; i++) {
  const r = await processNext(db, { template: true });
  if (r.status === 'ready_for_review') break;
}
const [{ g }] = await db.query(`select json_object_agg(assignment_group, n) as g from (select assignment_group, count(*) n from run_orders where run_id = $1 group by 1) x`, [rp.id]);
lap(`groups ${JSON.stringify(g)}`);
assert.ok(!g.explore, 'random test 0% → no random-test orders');
lap(`summary ${JSON.stringify(await approvalSummary(db, rp.id))}`);
const rs = await approveAndSend(db, rp.id, 'owner');
lap(`replay sent ${rs.sent}`);
const rr = await runResults(db, rp.id);
lap(`replay funnel ${JSON.stringify(rr!.funnel)} resolved ${rr!.resolved_share.toFixed(2)} extra/order ${rr!.incremental_per_order?.toFixed(2)} total ${rr!.realised_gain?.toFixed(0)}`);
assert.ok(rr!.funnel.converted > 0, 'replay conversions are in immediately');
assert.equal(rr!.resolved_share, 1, 'a 10-day-old replay is fully measured');
const [{ n: custAfter }] = await db.query(`select sum(total_orders)::int as n from customers`);
lap(`customer total_orders before ${custBefore} after ${custAfter}`);
days = await daySummaries(db, 30);
assert.equal(days[10].ready, 0, 'replayed day has nothing left to run');
await assert.rejects(createRun(db, { date: old.date, role: 'owner' }), /already been in a campaign/);

const today = days[0].date;
const run = await createRun(db, { date: today, role: 'owner' });
lap(`campaign ${run.name} with ${run.orders} orders → ${run.href}`);
for (let i = 0; i < 100; i++) {
  const r = await processNext(db, { template: true });
  if (r.status === 'ready_for_review') break;
}
lap(`summary ${JSON.stringify(await approvalSummary(db, run.id))}`);
const sent = await approveAndSend(db, run.id, 'owner');
lap(`sent ${sent.sent}`);
await sync(db, Date.now() + 40 * 60_000);
const res = await runResults(db, run.id);
lap(`after live responses: ${JSON.stringify(res!.funnel)}`);
assert.ok(res!.funnel.opened > 0, 'live responses should arrive within minutes');

const diag = await dailyDiagnostics(db);
lap(`diagnostics ${diag.length} days; sample ${JSON.stringify(diag[5])}`);
lap(`new randomised outcomes ${await countNewRandomisedOutcomes(db)}`);
await startRetrain(db, 'owner');
for (let i = 0; i < 12; i++) {
  const r: any = await trainingStep(db);
  if (r.status === 'done') {
    lap(`retrained v${r.version}`);
    break;
  }
}
const [cand] = await db.query(`select version, status, metrics->'conversion' as c from model_versions order by version desc limit 1`);
lap(`candidate ${JSON.stringify(cand)}`);
const [sz] = await db.query(`select pg_size_pretty(pg_database_size(current_database())) as size, (select count(*) from orders) as orders, (select count(*) from events) as events`);
lap(`db ${JSON.stringify(sz)}`);
