'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { num, pct, simDate, inr } from '@/lib/format';
import { api, useLive } from './live';

interface BatchRow {
  id: string;
  sim_date: string;
  total_orders: number;
  eligible_orders: number;
  available: number;
  worked_on: number;
  sent: number;
  self_converted: number;
  closed: boolean | null;
}
interface Preview {
  orders: number;
  model_version: number;
  settings: { discount_amount: number; max_discount: number; holdout_pct: number; exploration_pct: number };
}

export function CreateRun() {
  const { state, refreshState, toast } = useLive();
  const router = useRouter();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (ids: string[] | null) => {
    const q = ids && ids.length ? `?batches=${ids.join(',')}` : '';
    const r = await api<{ batches: BatchRow[]; preview: Preview | null }>(`/api/runs/preview${q}`);
    setBatches(r.batches);
    if (ids === null) {
      const first = r.batches.find((b) => Number(b.available) > 0);
      const def = first ? [first.id] : [];
      setSelected(def);
      if (def.length) load(def);
    } else setPreview(r.preview);
  }, []);

  useEffect(() => {
    load(null);
  }, [load, state?.latest_batch?.id]);

  const toggle = (id: string) => {
    const next = selected?.includes(id) ? selected.filter((x) => x !== id) : [...(selected ?? []), id];
    setSelected(next);
    setConfirming(false);
    if (next.length) load(next);
    else setPreview(null);
  };

  const authorise = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: number; orders: number }>('/api/runs', { method: 'POST', json: { batchIds: selected } });
      toast(`Run #${r.id} authorised: ${r.orders.toLocaleString('en-IN')} orders. Model running…`, 'info', `/runs/${r.id}`);
      await refreshState();
      router.push(`/runs/${r.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create run', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2>1 · Choose COD order batches</h2>
          <span className="text-xs text-ink-faint">New eligible orders only (never in a run, not converted, before dispatch)</span>
        </div>
        <div className="overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-8" />
                <th>Batch date</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Eligible</th>
                <th className="text-right">Already worked on</th>
                <th className="text-right">Sent</th>
                <th className="text-right">Self-converted</th>
                <th className="text-right">Available for a new run</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const avail = Number(b.available);
                return (
                  <tr key={b.id} className={avail ? 'cursor-pointer' : 'opacity-60'} onClick={() => avail && toggle(b.id)}>
                    <td>
                      <input type="checkbox" disabled={!avail} checked={selected?.includes(b.id) ?? false} readOnly className="accent-brand-600" />
                    </td>
                    <td className="font-medium">{simDate(b.sim_date)}</td>
                    <td className="text-right">{num(b.total_orders)}</td>
                    <td className="text-right">{num(b.eligible_orders)}</td>
                    <td className="text-right">{num(b.worked_on)}</td>
                    <td className="text-right">{num(b.sent)}</td>
                    <td className="text-right">{num(b.self_converted)}</td>
                    <td className="text-right font-semibold">{num(avail)}</td>
                    <td>{b.closed ? <span className="pill bg-gray-100 text-ink-soft">Dispatched</span> : <span className="pill bg-brand-100 text-brand-700">Open</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad">
        <div className="flex items-center justify-between">
          <h2>2 · Applied settings</h2>
          <Link href="/settings" className="text-xs font-medium text-rzp hover:underline">
            Settings →
          </Link>
        </div>
        {preview ? (
          <div className="mt-3 grid grid-cols-5 gap-3 text-sm">
            <div><div className="label">Discount</div><div className="font-medium">{inr(preview.settings.discount_amount)}</div></div>
            <div><div className="label">Max discount / order</div><div className="font-medium">{inr(preview.settings.max_discount)}</div></div>
            <div><div className="label">Holdout</div><div className="font-medium">{pct(preview.settings.holdout_pct, 0)}</div></div>
            <div><div className="label">Exploration</div><div className="font-medium">{pct(preview.settings.exploration_pct, 0)}</div></div>
            <div><div className="label">Model</div><div className="font-medium">v{preview.model_version}</div></div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-ink-faint">Choose a batch to see the settings this run will use.</div>
        )}
      </div>

      <div className="card card-pad">
        <h2>3 · Authorise run</h2>
        {!confirming ? (
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-primary" disabled={!preview || !preview.orders} onClick={() => setConfirming(true)}>
              Authorise run
            </button>
            {preview && <span className="text-sm text-ink-soft">{num(preview.orders)} orders in scope</span>}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-rzp/30 bg-rzp-soft p-3">
            <div className="text-sm font-medium">Confirm this run</div>
            <ul className="mt-2 space-y-0.5 text-sm text-ink-soft">
              <li>{num(preview?.orders)} new eligible repeat-COD orders from {(selected ?? []).map(simDate).join(', ')}</li>
              <li>Model v{preview?.model_version} scores every order; the decision step picks the action with the highest expected gain</li>
              <li>{pct(preview?.settings.holdout_pct, 0)} holdout (no message) and {pct(preview?.settings.exploration_pct, 0)} exploration are assigned at random</li>
              <li>Messages are drafted for review. Nothing is sent until the Owner approves.</li>
            </ul>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primary" disabled={busy} onClick={authorise}>
                {busy ? 'Starting…' : 'Confirm and start'}
              </button>
              <button className="btn" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
