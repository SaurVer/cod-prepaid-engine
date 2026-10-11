import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/cards';
import { AutoRefresh } from '@/components/live';
import { RunProgress } from '@/components/run-progress';
import { ACTION_LABEL, inr, num, simDate, simTime, STATUS_LABEL } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { runReview } from '@/lib/server/runs.ts';

export const dynamic = 'force-dynamic';

const ACTION_COPY: Record<string, string> = {
  none: 'The model expects no message to beat doing nothing for these orders.',
  nudge: 'A prepaid link with no discount is expected to earn the most.',
  discount: 'A prepaid link with the discount is expected to earn the most.',
};

export default async function RunReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = Number(id);
  const data = await runReview(getDb(), runId);
  if (!data) notFound();
  const { run, cards, groups, samples, fallbacks } = data;
  const active = ['queued', 'scoring', 'deciding', 'drafting'].includes(run.status);
  const card = (a: string) => cards.find((c) => c.action === a) ?? { n: 0, gain: 0, ev: 0 };
  const sample = (a: string) => samples.find((s) => s.action === a);
  const holdout = groups.filter((g) => g.g === 'holdout').reduce((s, g) => s + g.n, 0);
  const explore = groups.filter((g) => g.g === 'explore');
  const exploreN = explore.reduce((s, g) => s + g.n, 0);

  return (
    <div className="space-y-4">
      <AutoRefresh on={['runs']} />
      <PageHeader
        title={`Run #${runId}`}
        sub={
          <span>
            {STATUS_LABEL[run.status]} · {num(run.order_count)} orders · batches {(run.source_batch_ids ?? []).map(simDate).join(', ')} · model v
            {run.model_version} · created {simTime(run.created_at)} by {run.created_by_role}
          </span>
        }
        actions={
          run.status === 'ready_for_review' ? (
            <Link href={`/messages?run=${runId}`} className="btn btn-primary">
              Review &amp; approve
            </Link>
          ) : run.status === 'sent' ? (
            <Link href={`/results?run=${runId}`} className="btn">
              View results
            </Link>
          ) : null
        }
      />
      {active && <RunProgress runId={runId} initial={{ status: run.status, progress: Number(run.progress), eta_seconds: run.eta_seconds }} />}
      {!active && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(['none', 'nudge', 'discount'] as const).map((a) => {
              const c = card(a);
              const s = sample(a);
              return (
                <div key={a} className="card flex flex-col">
                  <div className="border-b border-line px-4 py-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base">{ACTION_LABEL[a]}</h2>
                      <span className="text-2xs text-ink-faint">Model group</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">{ACTION_COPY[a]}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-4 py-3">
                    <div>
                      <div className="label">Customers</div>
                      <div className="metric">{num(c.n)}</div>
                    </div>
                    <div>
                      <div className="label">Expected net ₹ vs doing nothing</div>
                      <div className="metric text-brand-700">{inr(Number(c.gain))}</div>
                    </div>
                  </div>
                  <div className="mx-4 mb-3 flex-1 rounded-md bg-canvas p-3 text-xs text-ink-soft">
                    {a === 'none' ? (
                      <span className="text-ink-faint">No message is drafted for these orders.</span>
                    ) : s ? (
                      <>
                        <div className="label mb-1">Sample LLM message · {s.variant_tag}</div>
                        <div className="text-ink">“{s.final_text}”</div>
                      </>
                    ) : (
                      <span className="text-ink-faint">No orders.</span>
                    )}
                  </div>
                  <div className="border-t border-line px-4 py-2">
                    <Link href={`/messages?run=${runId}&group=model&action=${a}`} className="text-xs font-medium text-rzp hover:underline">
                      View orders →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="card card-pad">
              <div className="flex items-center justify-between">
                <h2>Holdout</h2>
                <Link href={`/messages?run=${runId}&group=holdout`} className="text-xs font-medium text-rzp hover:underline">
                  View →
                </Link>
              </div>
              <div className="metric mt-1">{num(holdout)}</div>
              <p className="text-xs text-ink-faint">Randomly held back with no message, to measure incremental ₹.</p>
            </div>
            <div className="card card-pad">
              <div className="flex items-center justify-between">
                <h2>Exploration</h2>
                <Link href={`/messages?run=${runId}&group=explore`} className="text-xs font-medium text-rzp hover:underline">
                  View →
                </Link>
              </div>
              <div className="metric mt-1">{num(exploreN)}</div>
              <p className="text-xs text-ink-faint">
                Randomly given a nudge ({num(explore.find((g) => g.action === 'nudge')?.n ?? 0)}) or a discount (
                {num(explore.find((g) => g.action === 'discount')?.n ?? 0)}), so the model keeps learning.
              </p>
            </div>
          </div>
          {fallbacks && Number(fallbacks.fallback) > 0 && (
            <div className="text-xs text-ink-faint">
              {num(fallbacks.fallback)} of {num(fallbacks.total)} messages used the fixed fallback template.
            </div>
          )}
        </>
      )}
    </div>
  );
}
