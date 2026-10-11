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

const days = await daySummaries(db, 30);
lap(`days: ${days.length}; today ${JSON.stringify({ ...days[0], campaigns: days[0].campaigns.length })}`);
const y = days[1];
lap(`yesterday ${y.date}: orders ${y.total}, eligible ${y.eligible}, campaigns ${JSON.stringify(y.campaigns.map((c) => ({ status: c.status, sent: c.sent, paid: c.paid_online, extra: c.extra_per_order, resolved: c.resolved_share })))}`);
const old = days[10];
lap(`${old.date}: ${JSON.stringify(old.campaigns.map((c) => ({ sent: c.sent, paid: c.paid_online, extra: c.extra_per_order?.toFixed(2), total: c.extra_total?.toFixed(0), exp: c.expected_gain.toFixed(0) })))}`);
lap(`cod cost today ${JSON.stringify(await codCost(db, days[0].eligible))}`);

// live sync adds orders over time
const s1 = await sync(db, Date.now() + 30 * 60_000);
lap(`sync +30min added ${s1.added}`);

const today = days[0].date;
const run = await createRun(db, { batchIds: [today], role: 'owner' });
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
