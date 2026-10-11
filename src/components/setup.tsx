'use client';

import { useState } from 'react';

const STEPS: { key: string; label: string }[] = [
  { key: 'reset', label: 'Clearing everything and writing settings' },
  { key: 'customers', label: 'Creating 15,000 customers' },
  { key: 'pilot-1', label: 'Training pilot (before the 30 days): part 1' },
  { key: 'pilot-2', label: 'Training pilot: part 2' },
  { key: 'pilot-3', label: 'Training pilot: part 3' },
  { key: 'train', label: 'Training model v1' },
  { key: 'history-1', label: 'Last 30 days: days 1–5, with evening campaigns' },
  { key: 'history-2', label: 'Last 30 days: days 6–10' },
  { key: 'history-3', label: 'Last 30 days: days 11–15' },
  { key: 'history-4', label: 'Last 30 days: days 16–20' },
  { key: 'history-5', label: 'Last 30 days: days 21–25' },
  { key: 'history-6', label: 'Last 30 days: days 26–29' },
  { key: 'today', label: "Today's orders so far (no campaign yet)" },
];

/** Full reset + re-seed, one step per request, with real progress. */
export function SeedRunner({ token }: { token: string }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const start = async () => {
    setConfirm(false);
    setError(null);
    setDone({});
    setFinished(false);
    for (const s of STEPS) {
      setCurrent(s.key);
      try {
        const res = await fetch('/api/admin/setup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ step: s.key, token }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Step failed (${res.status})`);
        setDone((d) => ({ ...d, [s.key]: body.message }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Reset failed');
        setCurrent(null);
        return;
      }
    }
    setCurrent(null);
    setFinished(true);
  };

  return (
    <div className="space-y-4">
      {!confirm && !current && (
        <button className="btn btn-primary" onClick={() => setConfirm(true)} disabled={!token}>
          Reset everything
        </button>
      )}
      {confirm && (
        <div className="flex items-center gap-2 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-bad">
          This deletes all orders, campaigns, messages and models, then rebuilds the last 30 days. Continue?
          <button className="btn btn-sm btn-primary" onClick={start}>
            Yes, reset
          </button>
          <button className="btn btn-sm" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      )}
      <ol className="space-y-1.5 text-[13px]">
        {STEPS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${done[s.key] ? 'bg-ok' : current === s.key ? 'animate-pulse bg-rzp' : 'bg-line'}`} />
            <span className={done[s.key] ? 'text-ink' : 'text-ink-faint'}>{s.label}</span>
            {done[s.key] && <span className="text-[12px] text-ink-faint">· {done[s.key]}</span>}
          </li>
        ))}
      </ol>
      {error && <div className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</div>}
      {finished && (
        <div className="rounded-lg border border-ok/30 bg-ok-soft px-3 py-2 text-[13px] text-ok">
          Done. <a href="/" className="font-medium underline">Open the dashboard →</a>
        </div>
      )}
    </div>
  );
}
