'use client';

import { useState } from 'react';
import { api } from './live';

const STEPS: { key: string; label: string }[] = [
  { key: 'reset', label: 'Clearing data and writing settings' },
  { key: 'customers', label: 'Creating 15,000 customers' },
  { key: 'pilot-1', label: 'Historical pilot: days 1–10' },
  { key: 'pilot-2', label: 'Historical pilot: days 11–20' },
  { key: 'pilot-3', label: 'Historical pilot: days 21–30' },
  { key: 'train', label: 'Training model v1 on the pilot' },
  { key: 'today', label: "Today's order batch" },
];

/** Runs the chunked seed one step per request, with real progress. */
export function SeedRunner({ needsToken, onDone, cta = 'Set up demo data' }: { needsToken: boolean; onDone?: () => void; cta?: string }) {
  const [token, setToken] = useState('');
  const [done, setDone] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setDone({});
    for (const s of STEPS) {
      setCurrent(s.key);
      try {
        const r = await api<{ message: string }>('/api/admin/setup', { method: 'POST', json: { step: s.key, token } });
        setDone((d) => ({ ...d, [s.key]: r.message }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Setup failed');
        setCurrent(null);
        return;
      }
    }
    setCurrent(null);
    if (onDone) onDone();
    else window.location.href = '/';
  };

  return (
    <div className="space-y-3">
      {needsToken && (
        <label className="block text-xs">
          <span className="label">Setup token</span>
          <input className="input mt-1 w-64" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
      )}
      <button className="btn btn-primary" disabled={current !== null} onClick={start}>
        {current ? 'Working…' : cta}
      </button>
      <ol className="space-y-1 text-sm">
        {STEPS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${done[s.key] ? 'bg-brand-500' : current === s.key ? 'animate-pulse bg-rzp' : 'bg-gray-300'}`}
            />
            <span className={done[s.key] ? 'text-ink' : 'text-ink-faint'}>{s.label}</span>
            {done[s.key] && <span className="text-xs text-ink-faint">· {done[s.key]}</span>}
          </li>
        ))}
      </ol>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
    </div>
  );
}
