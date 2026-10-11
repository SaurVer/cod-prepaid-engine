import Link from 'next/link';
import { PredActualChart } from '@/components/charts';
import { PromoteButton, RetrainButton } from '@/components/model-actions';
import { Badge, PageHeader, Tile } from '@/components/ui';
import { ACTION_LABEL, dateTimeIST, dayLabel, inr, num, orderCode, pct, weekday } from '@/lib/format';
import { FEATURE_NAMES, MODEL_KEYS, type ModelBundle, lrFor } from '@/lib/core/model.ts';
import { FEATURE_LABEL, MODEL_DATA, MODEL_NAME } from '@/lib/model-labels';
import { getDb } from '@/lib/server/db.ts';
import {
  countNewRandomisedOutcomes,
  dailyDiagnostics,
  loadModel,
  modelVersions,
  trainingDataSummary,
  trainingSample,
} from '@/lib/server/model.ts';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = { pilot: 'Pilot (before the 30 days)', control: 'Control group', random_test: 'Random test' };
const ACTIONS: [string, string][] = [
  ['none', 'No message'],
  ['nudge', 'Reminder'],
  ['discount', '₹50 off offer'],
];
const TABS: [string, string][] = [
  ['summary', 'Summary'],
  ['data', 'Training data'],
  ['parameters', 'Parameters'],
  ['runs', 'Run outputs'],
  ['accuracy', 'Accuracy'],
];

export default async function ModelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : 'summary';
  const db = getDb();
  const [versions, fresh, data] = await Promise.all([modelVersions(db), countNewRandomisedOutcomes(db), trainingDataSummary(db)]);
  const active = versions.find((v) => v.status === 'active');
  const candidate = versions.find((v) => v.status === 'candidate');
  const usable = data.reduce((a, r) => a + r.resolved, 0);
  const pending = data.reduce((a, r) => a + r.n - r.resolved, 0);
  const bySource = (s: string) => data.filter((r) => r.source === s).reduce((a, r) => a + r.resolved, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Model"
        sub="What the AI learns from, what it has learned, and what it predicted for every campaign."
        actions={<RetrainButton recommended={fresh >= 1500} />}
      />
      <div className="grid grid-cols-4 gap-4">
        <Tile label="Active model" value={active ? `v${active.version}` : '—'} sub={active ? `Trained ${dateTimeIST(active.trained_at)}` : undefined} />
        <Tile
          label="Training data available"
          tone="blue"
          value={num(usable)}
          sub={`${num(bySource('pilot'))} pilot · ${num(bySource('control'))} control · ${num(bySource('random_test'))} random test`}
          href="/model?tab=data"
        />
        <Tile
          label="New since last training"
          value={num(fresh)}
          sub={fresh >= 1500 ? 'Retrain recommended (over 1,500)' : `Retrain is recommended past 1,500${pending ? ` · ${num(pending)} still waiting for delivery` : ''}`}
        />
        <Tile label="What it predicts" value="12 chances" sub="per order: 4 chances × 3 actions, from 8 small models" href="/model?tab=parameters" />
      </div>

      <div className="flex gap-1 border-b border-line">
        {TABS.map(([k, l]) => (
          <Link
            key={k}
            href={`/model?tab=${k}`}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] ${tab === k ? 'border-rzp font-semibold text-rzp' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            {l}
            {k === 'accuracy' && candidate && <span className="ml-1.5 rounded-full bg-rzp px-1.5 text-[10px] text-white">new</span>}
          </Link>
        ))}
      </div>

      {tab === 'summary' && <Summary versions={versions} />}
      {tab === 'data' && <TrainingData data={data} />}
      {tab === 'parameters' && <Parameters version={active ? Number(active.version) : null} />}
      {tab === 'runs' && <RunOutputs />}
      {tab === 'accuracy' && <Accuracy active={active} candidate={candidate} />}
    </div>
  );
}

function Summary({ versions }: { versions: any[] }) {
  return (
    <div className="space-y-4">
      <div className="card px-5 py-4">
        <h2>How the AI decides, for every order</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-[12.5px] leading-relaxed text-ink-soft">
          <div className="rounded-lg bg-panel px-4 py-3">
            <div className="font-semibold text-ink">1 · Predict</div>
            For each action (no message, reminder, ₹50 off offer) the model predicts four chances: the customer <b className="text-ink">pays online (P)</b>,{' '}
            <b className="text-ink">cancels (K)</b>, the order is <b className="text-ink">returned if it stays COD (Rc)</b> and{' '}
            <b className="text-ink">returned if paid online (Rp)</b>.
          </div>
          <div className="rounded-lg bg-panel px-4 py-3">
            <div className="font-semibold text-ink">2 · Price each action</div>
            Those chances give five possible outcomes (prepaid delivered, prepaid returned, cancelled, COD delivered, COD returned). Expected profit = Σ chance ×
            profit of that outcome − message cost.
          </div>
          <div className="rounded-lg bg-panel px-4 py-3">
            <div className="font-semibold text-ink">3 · Pick</div>
            Gain = expected profit of the action − expected profit of no message. The AI sends the action with the biggest gain, and nothing if no gain is above
            ₹0. Control and random-test orders are set aside first, at random.
          </div>
        </div>
        <p className="mt-3 text-[12px] text-ink-faint">
          See it for real orders under{' '}
          <Link href="/model?tab=runs" className="link">
            Run outputs
          </Link>
          .
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="card px-5 py-4 text-[12.5px] leading-relaxed text-ink-soft">
          <h3 className="mb-1 text-ink">Training rule</h3>
          The model only learns from orders whose action was chosen at random: the <b className="text-ink">control group</b> (no message), the{' '}
          <b className="text-ink">random test</b> (a random reminder or offer) and the original <b className="text-ink">pilot</b>. Orders where the AI chose the
          action are used to measure it, never to train it, so its own choices cannot bias what it learns. An order becomes training data once its delivery
          outcome is known. The latest 20% of orders by time are held out to measure accuracy.
        </div>
        <div className="card px-5 py-4 text-[12.5px] text-ink-soft">
          <h3 className="mb-1 text-ink">Versions</h3>
          <ul className="space-y-1">
            {versions.map((v) => (
              <li key={v.version} className="flex items-center justify-between">
                <span>
                  v{v.version} · trained {dateTimeIST(v.trained_at)} · {num(v.training_rows)} training rows
                </span>
                <Badge tone={v.status === 'active' ? 'green' : v.status === 'candidate' ? 'blue' : 'gray'}>{v.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

async function TrainingData({ data }: { data: Awaited<ReturnType<typeof trainingDataSummary>> }) {
  const sample = await trainingSample(getDb(), 15);
  const sources = ['pilot', 'control', 'random_test'];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {sources.map((s) => {
          const rs = data.filter((r) => r.source === s);
          return (
            <div key={s} className="card px-4 py-3.5">
              <div className="label">{SOURCE_LABEL[s]}</div>
              <div className="metric mt-1.5">{num(rs.reduce((a, r) => a + r.resolved, 0))}</div>
              <div className="mt-1 text-[12px] text-ink-faint">
                orders with a known outcome · {num(rs.reduce((a, r) => a + r.n - r.resolved, 0))} waiting · {num(rs.reduce((a, r) => a + r.unused, 0))} not yet
                used
              </div>
            </div>
          );
        })}
      </div>
      <div className="card overflow-auto">
        <div className="border-b border-line px-4 py-3">
          <h2>What the training data looks like</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">Randomised orders by where they came from and what they were sent, with what happened.</p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Source</th>
              <th>Action (chosen at random)</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Outcome known</th>
              <th className="text-right">Paid online</th>
              <th className="text-right">Cancelled</th>
              <th className="text-right">Returned (of shipped)</th>
              <th className="text-right">Not yet used in a model</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={`${r.source}-${r.action}`}>
                <td>{SOURCE_LABEL[r.source]}</td>
                <td>{ACTION_LABEL[r.action]}</td>
                <td className="text-right">{num(r.n)}</td>
                <td className="text-right">{num(r.resolved)}</td>
                <td className="text-right">{r.resolved ? pct(r.paid_online / r.resolved) : '—'}</td>
                <td className="text-right">{r.resolved ? pct(r.cancelled / r.resolved) : '—'}</td>
                <td className="text-right">{r.shipped ? pct(r.rto / r.shipped) : '—'}</td>
                <td className="text-right">{num(r.unused)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-auto">
        <div className="border-b border-line px-4 py-3">
          <h2>Sample rows, exactly as the model sees them</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">Inputs are snapshotted when the order is placed. Labels are what happened.</p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Order</th>
              <th>Source</th>
              <th>Action</th>
              {['Delivered', 'Returns', 'COD share', 'Offer resp.', 'Delivery issue', 'Days since', 'Value', 'Tier', 'Channel'].map((h) => (
                <th key={h} className="text-right">
                  {h}
                </th>
              ))}
              <th className="border-l border-line">Paid online?</th>
              <th>Outcome</th>
              <th>Used in</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((r) => {
              const f = r.features;
              return (
                <tr key={r.id}>
                  <td className="font-mono text-[12px]">{orderCode(r.id)}</td>
                  <td>{Number(r.run_id) === 0 ? 'Pilot' : r.assignment_group === 'holdout' ? 'Control' : 'Random test'}</td>
                  <td>{ACTION_LABEL[r.chosen_action]}</td>
                  <td className="text-right">{f.delivered_orders}</td>
                  <td className="text-right">{f.rto_count}</td>
                  <td className="text-right">{pct(Number(f.cod_share), 0)}</td>
                  <td className="text-right">{pct(Number(f.past_offer_response_rate), 0)}</td>
                  <td className="text-right">{f.past_delivery_issue ? 'Yes' : 'No'}</td>
                  <td className="text-right">{f.days_since_last_order}</td>
                  <td className="text-right">{inr(Number(f.order_value))}</td>
                  <td className="text-right">{f.city_tier}</td>
                  <td className="text-right">{f.channel === 'whatsapp' ? 'WhatsApp' : 'Inbox'}</td>
                  <td className="border-l border-line">{r.paid_online ? <Badge tone="green">Yes</Badge> : 'No'}</td>
                  <td>{r.final_outcome === 'rto' ? 'Returned' : r.final_outcome === 'cancelled' ? 'Cancelled' : 'Delivered'}</td>
                  <td>{r.used_in_training_version ? `v${r.used_in_training_version}` : <span className="text-ink-faint">next model</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card px-5 py-4">
        <h3>Which rows each of the 8 models learns from</h3>
        <div className="mt-2 grid grid-cols-4 gap-2 text-[12px]">
          {MODEL_KEYS.map((k) => (
            <div key={k} className="rounded-lg bg-panel px-3 py-2">
              <div className="font-medium text-ink">{MODEL_NAME[k]}</div>
              <div className="text-ink-faint">{MODEL_DATA[k]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function Parameters({ version }: { version: number | null }) {
  if (!version) return <p className="text-ink-faint">No active model.</p>;
  const m: ModelBundle = await loadModel(getDb(), version);
  const feats = [...FEATURE_NAMES] as string[];
  const max = Math.max(...MODEL_KEYS.flatMap((k) => lrFor(m, k).weights.map((w) => Math.abs(w))), 0.01);
  const cell = (w: number) => {
    const a = Math.min(1, Math.abs(w) / max);
    return { background: w >= 0 ? `rgba(48,94,255,${0.08 + 0.5 * a})` : `rgba(217,45,63,${0.08 + 0.45 * a})` };
  };
  return (
    <div className="space-y-4">
      <div className="card overflow-auto">
        <div className="border-b border-line px-4 py-3">
          <h2>Model v{version} · weights of the 8 models</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            Each column is a small logistic regression. Inputs are standardised (centred and scaled with the numbers below), so weights are comparable: blue
            pushes the chance up, red pushes it down, darker means stronger. Chance = 1 / (1 + e^−(intercept + Σ weight × input)).
          </p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Input</th>
              {MODEL_KEYS.map((k) => (
                <th key={k} className="text-right normal-case">
                  {MODEL_NAME[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...feats, 'via_discount'].map((f, j) => (
              <tr key={f}>
                <td>{FEATURE_LABEL[f] ?? f}</td>
                {MODEL_KEYS.map((k) => {
                  const w = lrFor(m, k).weights[j];
                  return (
                    <td key={k} className="text-right font-mono text-[12px]" style={w == null ? undefined : cell(w)}>
                      {w == null ? '' : w.toFixed(3)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="font-medium">
              <td>Intercept (base rate)</td>
              {MODEL_KEYS.map((k) => (
                <td key={k} className="text-right font-mono text-[12px]">
                  {lrFor(m, k).bias.toFixed(3)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="card overflow-auto">
          <div className="border-b border-line px-4 py-3">
            <h2>Input scaling (from the training data)</h2>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Input</th>
                <th className="text-right">Average</th>
                <th className="text-right">Spread (std. dev.)</th>
              </tr>
            </thead>
            <tbody>
              {feats.map((f, j) => (
                <tr key={f}>
                  <td>{FEATURE_LABEL[f]}</td>
                  <td className="text-right">{m.scaler.mean[j].toFixed(2)}</td>
                  <td className="text-right">{m.scaler.std[j].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card px-5 py-4 text-[12.5px] text-ink-soft">
          <h2 className="mb-2">Training settings</h2>
          <table className="w-full">
            <tbody>
              {[
                ['Model type', '8 logistic regressions (one per chance and action)'],
                ['Optimiser', 'Full-batch gradient descent'],
                ['Iterations', '300'],
                ['Learning rate', '0.5'],
                ['L2 regularisation', '0.01'],
                ['Train / accuracy split', 'Oldest 80% / latest 20% of orders by time'],
                ['Training data', 'Randomised orders with a known outcome only'],
              ].map(([l, v]) => (
                <tr key={l} className="border-t border-line">
                  <td className="py-1.5">{l}</td>
                  <td className="py-1.5 text-right font-medium text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

async function RunOutputs() {
  const diag = await dailyDiagnostics(getDb());
  const byDate = diag.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.run_id - b.run_id));
  return (
    <div className="space-y-4">
      {diag.length > 0 && (
        <div className="card px-4 pb-2 pt-3.5">
          <div className="mb-1 flex items-center justify-between">
            <h2>Predicted vs actual paid-online rate, messaged orders</h2>
            <span className="text-[12px] text-ink-faint">By order day</span>
          </div>
          <PredActualChart data={byDate.map((d) => ({ date: d.date, predicted: d.predicted_paid, actual: d.window_closed ? d.actual_paid : null }))} />
        </div>
      )}
      <div className="card overflow-auto">
        <div className="border-b border-line px-4 py-3">
          <h2>Model output for each sent campaign</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">Click a day to see every order’s predictions, expected profit and decision.</p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Order day</th>
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
            {byDate
              .slice()
              .reverse()
              .map((d) => (
                <tr key={d.run_id}>
                  <td>
                    <Link className="link" href={`/model/runs/${d.run_id}`}>
                      {weekday(d.date)} {dayLabel(d.date)} →
                    </Link>
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
            {diag.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-ink-faint">
                  No campaigns sent yet. Run and send one from the{' '}
                  <Link href="/" className="link">
                    Overview
                  </Link>{' '}
                  and its model output appears here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Accuracy({ active, candidate }: { active: any; candidate: any }) {
  const compare = [active, candidate].filter(Boolean) as any[];
  return (
    <div className="card overflow-auto">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2>Accuracy on held-out recent orders {candidate ? '· active vs new model' : ''}</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            Ranking quality (AUC): 0.5 is a coin flip, 1.0 is perfect. Measured on the latest 20% of training orders, which the model did not learn from.
          </p>
        </div>
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
                    v{v.version} {v.status === 'active' ? '· active' : '· new'}
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
  );
}
