import { PredActualChart } from '@/components/charts';
import { PromoteButton, RetrainButton } from '@/components/model-actions';
import { Badge, PageHeader, Tile } from '@/components/ui';
import { dateTimeIST, dayLabel, inr, num, pct, weekday } from '@/lib/format';
import { MODEL_KEYS } from '@/lib/core/model.ts';
import { getDb } from '@/lib/server/db.ts';
import { countNewRandomisedOutcomes, dailyDiagnostics, modelVersions } from '@/lib/server/model.ts';

export const dynamic = 'force-dynamic';

const MODEL_NAME: Record<string, string> = {
  conv_none: 'Pays online · no message',
  conv_nudge: 'Pays online · reminder',
  conv_discount: 'Pays online · ₹50 off offer',
  cancel_none: 'Cancels · no message',
  cancel_nudge: 'Cancels · reminder',
  cancel_discount: 'Cancels · ₹50 off offer',
  rto_cod: 'Returned if COD',
  rto_pre: 'Returned if prepaid',
};
const ACTIONS: [string, string][] = [
  ['none', 'No message'],
  ['nudge', 'Reminder'],
  ['discount', '₹50 off offer'],
];

export default async function ModelPage() {
  const db = getDb();
  const versions = await modelVersions(db);
  const diag = await dailyDiagnostics(db);
  const fresh = await countNewRandomisedOutcomes(db);
  const active = versions.find((v) => v.status === 'active');
  const candidate = versions.find((v) => v.status === 'candidate');
  const compare = [active, candidate].filter(Boolean) as any[];
  const closed = diag.filter((d) => d.window_closed);
  const avgGap = closed.length ? closed.reduce((a, d) => a + Math.abs((d.predicted_paid ?? 0) - (d.actual_paid ?? 0)), 0) / closed.length : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Model"
        sub="How the AI scores orders, how accurate it has been each day, and when to retrain it."
        actions={<RetrainButton recommended={fresh >= 1500} />}
      />
      <div className="grid grid-cols-4 gap-4">
        <Tile label="Active model" value={active ? `v${active.version}` : '—'} sub={active ? `Trained ${dateTimeIST(active.trained_at)}` : undefined} />
        <Tile label="Training rows" value={num(active?.training_rows)} sub="Randomised orders only (control, random test, pilot)" />
        <Tile
          label="New randomised outcomes"
          tone={fresh >= 1500 ? 'blue' : undefined}
          value={num(fresh)}
          sub={fresh >= 1500 ? 'Retrain recommended (over 1,500)' : 'Retrain is recommended past 1,500'}
        />
        <Tile label="Average daily gap" value={avgGap == null ? '—' : `${(avgGap * 100).toFixed(1)} pts`} sub="Predicted vs actual paid-online rate, campaign days" />
      </div>

      <div className="card px-4 pb-2 pt-3.5">
        <div className="mb-1 flex items-center justify-between">
          <h2>Daily diagnostics · predicted vs actual paid-online rate</h2>
          <span className="text-[12px] text-ink-faint">Messaged orders on each campaign day</span>
        </div>
        <PredActualChart data={diag.map((d) => ({ date: d.date, predicted: d.predicted_paid, actual: d.window_closed ? d.actual_paid : null }))} />
      </div>

      <div className="card overflow-auto">
        <div className="border-b border-line px-4 py-3">
          <h2>Model output by day</h2>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Day</th>
              <th>Model</th>
              <th className="text-right">Orders scored</th>
              <th className="text-right">No message</th>
              <th className="text-right">Reminder</th>
              <th className="text-right">₹50 off offer</th>
              <th className="text-right">Messaged</th>
              <th className="text-right">Predicted paid online</th>
              <th className="text-right">Actual paid online</th>
              <th className="text-right">Ranking quality (AUC)</th>
              <th className="text-right">Expected extra profit</th>
            </tr>
          </thead>
          <tbody>
            {diag
              .slice()
              .reverse()
              .map((d) => (
                <tr key={d.run_id}>
                  <td>
                    <a className="link" href={`/day/${d.date}`}>
                      {weekday(d.date)} {dayLabel(d.date)}
                    </a>
                  </td>
                  <td>v{d.model_version}</td>
                  <td className="text-right">{num(d.scored)}</td>
                  <td className="text-right">{num(d.none)}</td>
                  <td className="text-right">{num(d.nudge)}</td>
                  <td className="text-right">{num(d.discount)}</td>
                  <td className="text-right">{num(d.sent)}</td>
                  <td className="text-right">{pct(d.predicted_paid)}</td>
                  <td className="text-right">{d.window_closed ? pct(d.actual_paid) : <span className="text-ink-faint">{pct(d.actual_paid)} so far</span>}</td>
                  <td className="text-right">{d.auc == null ? '—' : d.auc.toFixed(2)}</td>
                  <td className="text-right">{inr(d.expected_gain)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-auto">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2>Accuracy on held-out recent orders {candidate ? '· active vs candidate' : ''}</h2>
          {candidate && <PromoteButton version={Number(candidate.version)} />}
        </div>
        {compare.length === 0 ? (
          <p className="px-4 py-4 text-ink-faint">No model yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-0">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Model (ranking quality, AUC)</th>
                  {compare.map((v) => (
                    <th key={v.version} className="text-right">
                      v{v.version} {v.status === 'active' ? '· active' : '· candidate'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODEL_KEYS.map((k) => (
                  <tr key={k}>
                    <td>{MODEL_NAME[k]}</td>
                    {compare.map((v) => (
                      <td key={v.version} className="text-right">
                        {v.metrics?.auc?.[k] == null ? '—' : Number(v.metrics.auc[k]).toFixed(3)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="table-base border-l border-line">
              <thead>
                <tr>
                  <th>Paid-online rate on held-out orders</th>
                  {compare.map((v) => (
                    <th key={v.version} className="text-right">
                      v{v.version} predicted / actual
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTIONS.map(([a, l]) => (
                  <tr key={a}>
                    <td>{l}</td>
                    {compare.map((v) => {
                      const c = v.metrics?.conversion?.[a];
                      return (
                        <td key={v.version} className="text-right">
                          {c ? `${pct(c.predicted)} / ${pct(c.actual)}` : '—'}
                          {c && <span className="ml-1 text-[11px] text-ink-faint">n={num(c.n)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td>Trained on</td>
                  {compare.map((v) => (
                    <td key={v.version} className="text-right">
                      {num(v.training_rows)} rows
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card px-5 py-4 text-[12.5px] leading-relaxed text-ink-soft">
          <h3 className="mb-1 text-ink">Training rule</h3>
          The model only learns from orders whose action was chosen at random: the control group, the random test and the original pilot. Orders where the AI
          chose the action are used to monitor it, never to train it, so its own choices cannot bias what it learns. The latest 20% of orders by time are held
          out to measure accuracy.
        </div>
        <div className="card px-5 py-4 text-[12.5px] text-ink-soft">
          <h3 className="mb-1 text-ink">Versions</h3>
          <ul className="space-y-1">
            {versions.map((v) => (
              <li key={v.version} className="flex items-center justify-between">
                <span>
                  v{v.version} · trained {dateTimeIST(v.trained_at)} · {num(v.training_rows)} rows
                </span>
                <Badge tone={v.status === 'active' ? 'green' : v.status === 'candidate' ? 'blue' : 'gray'}>{v.status}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-ink-faint">Coming later: configuration recommendations (discount amount, control-group size).</p>
        </div>
      </div>
    </div>
  );
}
