import Link from 'next/link';
import { Badge, PageHeader } from '@/components/ui';
import { ACTION_LABEL, inr, num, orderCode, pct } from '@/lib/format';
import { FEATURE_NAMES, MODEL_KEYS, type ModelBundle, lrFor } from '@/lib/core/model.ts';
import { FEATURE_LABEL, MODEL_DATA, MODEL_NAME } from '@/lib/model-labels';
import { getDb } from '@/lib/server/db.ts';
import {
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
  ['data', 'Training data'],
  ['parameters', 'Model parameters'],
  ['accuracy', 'Accuracy'],
];

// Technical details for data teams: what the model learns from, its weights, and accuracy on held-out orders.
export default async function ModelDetailsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : 'data';
  const db = getDb();
  const [versions, data] = await Promise.all([modelVersions(db), trainingDataSummary(db)]);
  const active = versions.find((v) => v.status === 'active');
  const candidate = versions.find((v) => v.status === 'candidate');
  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: '/model', label: 'Model' }}
        title="Technical details"
        sub="For data teams: the training data, the model's parameters and its accuracy on recent orders it did not learn from."
      />
      <div className="flex gap-1 border-b border-line">
        {TABS.map(([k, l]) => (
          <Link
            key={k}
            href={`/model/details?tab=${k}`}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] ${tab === k ? 'border-rzp font-semibold text-rzp' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            {l}
          </Link>
        ))}
      </div>
      {tab === 'data' && <TrainingData data={data} />}
      {tab === 'parameters' && <Parameters version={active ? Number(active.version) : null} />}
      {tab === 'accuracy' && <Accuracy active={active} candidate={candidate} />}
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
