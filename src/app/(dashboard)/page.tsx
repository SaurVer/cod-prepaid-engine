import { GainCard, PageHeader, Stat } from '@/components/cards';
import { TrendChart } from '@/components/charts';
import { AutoRefresh } from '@/components/live';
import { CreateRunButton, NewBatchMarker } from '@/components/overview-live';
import { inr, num, pct, simDate } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { overview, runResults } from '@/lib/server/results.ts';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const db = getDb();
  const o = await overview(db);
  const recent = await db.query(`select id from runs where not is_pilot and status in ('sent', 'closed') order by id desc limit 3`);
  const cards = (await Promise.all(recent.map((r) => runResults(db, Number(r.id))))).filter(Boolean);
  const t = o.today;
  const prepaidShare = t ? o.excluded.prepaid / Number(t.total_orders) : 0;

  return (
    <div className="space-y-4">
      <AutoRefresh on={['batch', 'clock', 'runs']} />
      <PageHeader
        title="Overview"
        sub={
          <span className="flex items-center gap-2">
            Today&apos;s batch · {t ? simDate(t.sim_date) : '—'}
            <NewBatchMarker initialBatch={t?.id ?? null} />
          </span>
        }
        actions={<CreateRunButton />}
      />

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Total orders" value={num(t?.total_orders)} sub={`Batch ${t?.id ?? '—'}`} />
        <Stat label="COD orders" value={num(t?.cod_orders)} sub={t ? `${pct(Number(t.cod_orders) / Number(t.total_orders))} of orders` : undefined} />
        <Stat
          label="Eligible repeat-COD"
          tone="brand"
          value={num(t?.eligible_orders)}
          sub={`Excluded: ${num(o.excluded.first_time)} first-time COD · ${num(o.excluded.high_rto_risk)} high RTO risk`}
        />
        <Stat label="Prepaid share" value={pct(prepaidShare)} sub={`${num(o.excluded.prepaid)} prepaid orders`} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card card-pad col-span-1">
          <div className="label">Money at stake today</div>
          <div className="metric mt-1 text-brand-700">{inr(o.money.at_stake)}</div>
          <div className="mt-2 space-y-1 text-xs text-ink-soft">
            <div>
              {num(o.money.eligible)} eligible COD orders × {inr(o.money.cod_cost_per_order, 2)} estimated COD cost per order
            </div>
            <div className="text-ink-faint">
              COD cost = {inr(o.money.cod_fee)} cash fee + ({pct(o.money.cod_rto_rate)} COD RTO − {pct(o.money.prepaid_rto_rate)} prepaid RTO) ×{' '}
              {inr(o.money.rto_cost)} RTO cost. RTO rates from resolved eligible orders in the last 30 sim days.
            </div>
          </div>
        </div>
        <div className="card card-pad col-span-2">
          <div className="flex items-center justify-between">
            <h2>Orders and COD share · last 14 days</h2>
            <span className="text-2xs text-ink-faint">Live batches only</span>
          </div>
          <TrendChart data={o.trend} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2>Most recent sends</h2>
          <a href="/results" className="text-xs font-medium text-rzp hover:underline">
            All results →
          </a>
        </div>
        {cards.length === 0 && (
          <div className="card card-pad text-sm text-ink-faint">No sends yet. Create a run on today&apos;s batch to start.</div>
        )}
        {cards.map((r) => (
          <GainCard key={r!.run.id} r={r!} />
        ))}
      </div>
    </div>
  );
}
