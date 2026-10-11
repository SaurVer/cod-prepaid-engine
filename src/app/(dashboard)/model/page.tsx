import Link from 'next/link';
import { PromoteButton, RetrainButton } from '@/components/model-actions';
import { Badge, PageHeader } from '@/components/ui';
import { campaignName, dateTimeIST, dayLabel, num, pct } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { countNewRandomisedOutcomes, countPendingRandomised, dailyDiagnostics, modelVersions } from '@/lib/server/model.ts';

export const dynamic = 'force-dynamic';

/** New learning examples needed before retraining is recommended. */
const RETRAIN_AT = 1500;
const ACTIONS: [string, string][] = [
  ['none', 'Sent nothing'],
  ['nudge', 'Sent a reminder'],
  ['discount', 'Sent the offer'],
];

export default async function ModelPage() {
  const db = getDb();
  const [versions, fresh, pending, runs] = await Promise.all([
    modelVersions(db),
    countNewRandomisedOutcomes(db),
    countPendingRandomised(db),
    dailyDiagnostics(db),
  ]);
  const active = versions.find((v) => v.status === 'active');
  const candidate = versions.find((v) => v.status === 'candidate');
  const recommended = fresh >= RETRAIN_AT;
  const progress = Math.min(1, fresh / RETRAIN_AT);
  const gap = (v: any) => {
    const c = v?.metrics?.conversion;
    if (!c) return null;
    const rows = ['none', 'nudge', 'discount'].map((a) => c[a]).filter((x) => x && x.n > 0);
    const n = rows.reduce((s, x) => s + x.n, 0);
    return n ? rows.reduce((s, x) => s + x.n * Math.abs(x.predicted - x.actual), 0) / n : null;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Model"
        sub="The AI predicts how each customer will respond to each message. Here you can see what it predicted, and keep it up to date."
        actions={
          <Link href="/model/details" className="text-[12.5px] font-medium text-ink-soft hover:text-ink">
            Technical details →
          </Link>
        }
      />

      {/* 1. Learning and retraining */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-12">
          <div className="col-span-7 px-6 py-5">
            <div className="flex items-center gap-2">
              <h2>Keeping the model up to date</h2>
              {recommended ? <Badge tone="blue">Retrain recommended</Badge> : <Badge tone="gray">Up to date</Badge>}
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="metric">{num(fresh)}</span>
              <span className="pb-1 text-[13px] text-ink-soft">new learning examples since the model was last trained</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-panel">
              <div className={`h-full rounded-full ${recommended ? 'bg-rzp' : 'bg-rzp/50'}`} style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-ink-faint">
              <span>
                {recommended
                  ? 'Enough new examples: retraining is recommended.'
                  : `${num(RETRAIN_AT - fresh)} more to go before retraining is recommended`}
              </span>
              <span>{num(RETRAIN_AT)}</span>
            </div>
            {pending > 0 && (
              <p className="mt-2 text-[12.5px] text-ink-soft">
                {num(pending)} more will be added as their deliveries are confirmed (3–5 days after shipping).
              </p>
            )}
            <p className="mt-4 rounded-lg bg-panel px-4 py-3 text-[12.5px] leading-relaxed text-ink-soft">
              <b className="text-ink">What is a learning example?</b> An order from one of your campaigns that was set aside at random: the control group (sent
              nothing) or the random test (sent a random reminder or offer), once we know whether it was delivered. The model learns only from these, because the
              AI didn&apos;t choose what they got, so it can&apos;t learn from its own guesses.
            </p>
          </div>
          <div className="col-span-5 flex flex-col justify-between border-l border-line bg-panel/40 px-6 py-5">
            <div>
              <div className="label">Model in use</div>
              <div className="mt-1 text-[20px] font-semibold">{active ? `Version ${active.version}` : '—'}</div>
              {active && (
                <div className="mt-0.5 text-[12.5px] text-ink-soft">
                  Trained {dateTimeIST(active.trained_at)} on {num(active.training_rows)} examples
                </div>
              )}
            </div>
            {candidate ? (
              <div className="mt-4 rounded-lg border border-rzp/30 bg-white px-4 py-3">
                <div className="font-medium">Version {candidate.version} is trained and ready</div>
                <p className="mt-1 text-[12.5px] text-ink-soft">
                  On recent orders neither model learned from, the predicted share paying online was off by{' '}
                  <b className="text-ink">{gap(active) == null ? '—' : `${(gap(active)! * 100).toFixed(1)} pts`}</b> for the current model and{' '}
                  <b className="text-ink">{gap(candidate) == null ? '—' : `${(gap(candidate)! * 100).toFixed(1)} pts`}</b> for version {candidate.version}.
                  Smaller is better.
                </p>
                <div className="mt-2">
                  <PromoteButton version={Number(candidate.version)} />
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <RetrainButton recommended={recommended} />
                <p className="mt-2 text-[12px] text-ink-faint">
                  Retraining makes a new version. The current one keeps running until you switch.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Predictions for each campaign */}
      <div className="card overflow-auto">
        <div className="border-b border-line px-5 py-3.5">
          <h2>What the model predicted in each campaign</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            Open a campaign to see, for every order, the chance of paying online, cancelling or being returned under each choice, and why the AI picked what it did.
          </p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Orders from</th>
              <th className="text-right">Orders scored</th>
              {ACTIONS.map(([k, l]) => (
                <th key={k} className="text-right">
                  AI: {l.toLowerCase()}
                </th>
              ))}
              <th className="text-right">Expected to pay online</th>
              <th className="text-right">Actually paid online</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs
              .slice()
              .reverse()
              .map((d) => (
                <tr key={d.run_id}>
                  <td>
                    <Link className="link" href={`/model/runs/${d.run_id}`}>
                      {campaignName(d.created_at)}
                    </Link>
                  </td>
                  <td>{dayLabel(d.date)}</td>
                  <td className="text-right">{num(d.scored)}</td>
                  <td className="text-right">{num(d.none)}</td>
                  <td className="text-right">{num(d.nudge)}</td>
                  <td className="text-right">{num(d.discount)}</td>
                  <td className="text-right">{pct(d.predicted_paid)}</td>
                  <td className="text-right">
                    {d.status === 'ready_for_review' ? (
                      <span className="text-ink-faint">Not sent yet</span>
                    ) : d.window_closed ? (
                      pct(d.actual_paid)
                    ) : (
                      <span className="text-ink-faint">{pct(d.actual_paid)} so far</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link className="link text-[12px]" href={`/model/runs/${d.run_id}`}>
                      See every order →
                    </Link>
                  </td>
                </tr>
              ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-ink-faint">
                  No campaigns yet. Run one from the{' '}
                  <Link href="/" className="link">
                    Overview
                  </Link>{' '}
                  and its predictions appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {runs.length > 0 && (
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-ink-faint">
            “Expected” and “actually” cover the orders that were sent a message.
          </p>
        )}
      </div>
    </div>
  );
}
