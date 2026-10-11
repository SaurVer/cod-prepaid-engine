import Link from 'next/link';
import { PageHeader } from '@/components/cards';
import { AutoRefresh } from '@/components/live';
import { inr, num, simDate, simTime, STATUS_LABEL } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { runResults } from '@/lib/server/results.ts';
import { listRuns } from '@/lib/server/runs.ts';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  ready_for_review: 'bg-rzp-soft text-rzp',
  sent: 'bg-brand-100 text-brand-700',
  closed: 'bg-gray-100 text-ink-soft',
  paused: 'bg-amber-100 text-amber-800',
};

export default async function RunsPage() {
  const db = getDb();
  const runs = await listRuns(db);
  const realised = new Map<number, number | null>();
  for (const r of runs.filter((x) => x.status === 'sent' || x.status === 'closed')) {
    const res = await runResults(db, Number(r.id));
    realised.set(Number(r.id), res?.realised_gain ?? null);
  }
  return (
    <div className="space-y-4">
      <AutoRefresh on={['runs', 'batch']} />
      <PageHeader
        title="Runs"
        sub="Each run scores, decides and drafts messages for a set of COD order batches."
        actions={
          <Link href="/runs/new" className="btn btn-primary">
            Create run
          </Link>
        }
      />
      <div className="card overflow-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Created (sim)</th>
              <th>Batch dates</th>
              <th className="text-right">Orders</th>
              <th>Model</th>
              <th className="text-right">Expected gain (model group)</th>
              <th className="text-right">Realised gain vs holdout</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-ink-faint">
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map((r) => {
              const id = Number(r.id);
              const rg = realised.get(id);
              const active = ['queued', 'scoring', 'deciding', 'drafting'].includes(r.status);
              return (
                <tr key={id}>
                  <td className="font-semibold">
                    <Link href={`/runs/${id}`} className="hover:underline">
                      #{id}
                    </Link>
                  </td>
                  <td>
                    <span className={`pill ${STATUS_TONE[r.status] ?? 'bg-rzp-soft text-rzp'}`}>
                      {STATUS_LABEL[r.status]}
                      {active ? ` · ${Math.round(Number(r.progress))}%` : ''}
                    </span>
                  </td>
                  <td>{simTime(r.created_at)}</td>
                  <td>{(r.source_batch_ids ?? []).map(simDate).join(', ')}</td>
                  <td className="text-right">{num(r.order_count)}</td>
                  <td>v{r.model_version}</td>
                  <td className="text-right">{active ? '—' : inr(Number(r.expected_gain))}</td>
                  <td className="text-right">
                    {r.status === 'sent' || r.status === 'closed' ? (rg == null ? <span className="text-ink-faint">Pending</span> : inr(rg)) : '—'}
                  </td>
                  <td className="text-right">
                    <Link href={`/runs/${id}`} className="text-xs font-medium text-rzp hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
