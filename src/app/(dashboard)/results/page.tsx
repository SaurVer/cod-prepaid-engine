import Link from 'next/link';
import { GainCard, PageHeader } from '@/components/cards';
import { CumulativeChart, GroupBars } from '@/components/charts';
import { AutoRefresh } from '@/components/live';
import { RunSelect } from '@/components/run-select';
import { inr, num, pct, simDate } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { type GroupStats, runResults } from '@/lib/server/results.ts';

export const dynamic = 'force-dynamic';

function Row({ label, model, holdout, fmt }: { label: string; model: number | null; holdout: number | null; fmt: (n: number | null) => string }) {
  const diff = model != null && holdout != null ? model - holdout : null;
  return (
    <tr>
      <td className="font-medium">{label}</td>
      <td className="text-right">{fmt(model)}</td>
      <td className="text-right">{fmt(holdout)}</td>
      <td className="text-right text-ink-soft">{diff == null ? '—' : `${diff >= 0 ? '+' : ''}${fmt(diff)}`}</td>
    </tr>
  );
}

function rows(m: GroupStats, h: GroupStats) {
  return [
    { label: 'Prepaid conversion', model: m.conversion_rate, holdout: h.conversion_rate, fmt: (n: number | null) => pct(n) },
    { label: 'Cancellation (of resolved)', model: m.cancel_rate, holdout: h.cancel_rate, fmt: (n: number | null) => pct(n) },
    { label: 'RTO (of shipped, resolved)', model: m.rto_rate, holdout: h.rto_rate, fmt: (n: number | null) => pct(n) },
    { label: 'Realised net ₹ per resolved order', model: m.realised_per_order, holdout: h.realised_per_order, fmt: (n: number | null) => inr(n, 2) },
  ];
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const sentRuns = await db.query(`select id, source_batch_ids from runs where not is_pilot and status in ('sent', 'closed') order by id desc`);
  if (!sentRuns.length) {
    return (
      <div>
        <PageHeader title="Results" />
        <div className="card card-pad text-sm text-ink-faint">
          Nothing sent yet. Approve a run on the{' '}
          <Link href="/messages" className="font-medium text-rzp hover:underline">
            Messages
          </Link>{' '}
          page to see results here.
        </div>
      </div>
    );
  }
  const runId = Number(sp.run ?? sentRuns[0].id);
  const all = (await Promise.all(sentRuns.map((r) => runResults(db, Number(r.id))))).filter(Boolean).map((r) => r!);
  const r = all.find((x) => Number(x.run.id) === runId) ?? all[0];
  const m = r.groups.model;
  const h = r.groups.holdout;
  const batches = await db.query(`select sim_date, total_orders from order_batches where not is_pilot order by sim_date desc limit 2`);
  const volChange = batches.length === 2 ? Number(batches[0].total_orders) / Number(batches[1].total_orders) - 1 : null;

  let cumEst = 0;
  let cumReal = 0;
  let realisedOpen = true;
  const cumulative = all
    .slice()
    .reverse()
    .map((x) => {
      cumEst += x.estimated_gain_model;
      if (x.realised_gain == null) realisedOpen = false;
      if (realisedOpen) cumReal += x.realised_gain ?? 0;
      return { label: `#${x.run.id}`, estimated: Math.round(cumEst), realised: realisedOpen ? Math.round(cumReal) : null };
    });

  return (
    <div className="space-y-4">
      <AutoRefresh on={['clock', 'runs']} />
      <PageHeader
        title="Results"
        sub="Treated (model group) vs randomised holdout. Realised values fill in as delivery outcomes resolve. All figures are simulated."
        actions={<RunSelect base="/results" value={Number(r.run.id)} runs={all.map((x) => ({ id: Number(x.run.id), label: `Run #${x.run.id} · ${(x.run.source_batch_ids ?? []).map(simDate).join(', ')}` }))} />}
      />

      <GainCard r={r} />

      <div className="grid grid-cols-3 gap-3">
        <div className="card card-pad">
          <div className="label">Incremental net ₹ per eligible order</div>
          <div className={`metric mt-1 ${r.incremental_per_order == null ? 'text-ink-faint' : r.incremental_per_order >= 0 ? 'text-brand-700' : 'text-red-700'}`}>
            {r.incremental_per_order == null ? 'Pending' : inr(r.incremental_per_order, 2)}
          </div>
          <div className="mt-1 text-xs text-ink-faint">
            {r.incremental_per_order == null
              ? `${pct(r.resolved_share, 0)} of model and holdout outcomes resolved. Delivery outcomes land 3–5 sim days after dispatch.`
              : `Model group (${num(m.n)} orders) minus holdout (${num(h.n)} orders), realised net ₹ per order. Primary metric.`}
          </div>
          <div className="mt-3 border-t border-line pt-2 text-xs text-ink-soft">
            Realised gain for this run: <span className="font-semibold">{r.realised_gain == null ? 'pending' : inr(r.realised_gain)}</span> · estimated{' '}
            {inr(r.estimated_gain_model)}
          </div>
        </div>
        <div className="card col-span-2 overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="text-right">Treated · model group ({num(m.n)})</th>
                <th className="text-right">Holdout ({num(h.n)})</th>
                <th className="text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows(m, h).map((x) => (
                <Row key={x.label} {...x} />
              ))}
              <tr>
                <td className="font-medium">Outcomes resolved</td>
                <td className="text-right">{num(m.resolved)}</td>
                <td className="text-right">{num(h.resolved)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <div className="px-3 pb-2">
            <GroupBars
              data={[
                { metric: 'Prepaid conversion', model: m.conversion_rate, holdout: h.conversion_rate },
                { metric: 'Cancellation', model: m.cancel_rate, holdout: h.cancel_rate },
                { metric: 'RTO', model: m.rto_rate, holdout: h.rto_rate },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card card-pad">
          <h2>Guardrails</h2>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-soft">Order volume, latest batch vs previous</span>
              <span className="font-medium">{volChange == null ? '—' : `${volChange >= 0 ? '+' : ''}${pct(volChange)}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">Cancellation, treated vs holdout</span>
              <span className="font-medium">
                {pct(m.cancel_rate)} vs {pct(h.cancel_rate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">Exploration group (not in the comparison)</span>
              <span className="font-medium">{num(r.groups.explore.n)} orders</span>
            </div>
          </div>
        </div>
        <div className="card card-pad col-span-2">
          <h2>Cumulative gains across runs</h2>
          <CumulativeChart data={cumulative} />
        </div>
      </div>

      <div className="card overflow-auto">
        <div className="border-b border-line px-3 py-2">
          <h2>Past runs</h2>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Run</th>
              <th>Batches</th>
              <th className="text-right">Sent</th>
              <th className="text-right">CTR</th>
              <th className="text-right">Converted</th>
              <th className="text-right">Est. gain</th>
              <th className="text-right">Incremental ₹ / order</th>
              <th className="text-right">Realised gain</th>
            </tr>
          </thead>
          <tbody>
            {all.map((x) => (
              <tr key={x.run.id}>
                <td className="font-semibold">
                  <Link href={`/results?run=${x.run.id}`} className="hover:underline">
                    #{x.run.id}
                  </Link>
                </td>
                <td>{(x.run.source_batch_ids ?? []).map(simDate).join(', ')}</td>
                <td className="text-right">{num(x.funnel.sent)}</td>
                <td className="text-right">{pct(x.funnel.ctr)}</td>
                <td className="text-right">{num(x.funnel.converted)}</td>
                <td className="text-right">{inr(x.estimated_gain_model)}</td>
                <td className="text-right">{x.incremental_per_order == null ? <span className="text-ink-faint">Pending</span> : inr(x.incremental_per_order, 2)}</td>
                <td className="text-right">{x.realised_gain == null ? <span className="text-ink-faint">Pending</span> : inr(x.realised_gain)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
