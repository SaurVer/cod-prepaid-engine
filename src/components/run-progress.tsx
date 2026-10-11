'use client';

import { duration, STATUS_LABEL } from '@/lib/format';
import { useLive } from './live';

const STAGES = ['queued', 'scoring', 'deciding', 'drafting', 'ready_for_review'];

export function RunProgress({ runId, initial }: { runId: number; initial: { status: string; progress: number; eta_seconds: number | null } }) {
  const { state } = useLive();
  const live = state?.active_runs.find((r) => r.id === runId);
  const status = live?.status ?? initial.status;
  const progress = live?.progress ?? initial.progress;
  const eta = live?.eta_seconds ?? initial.eta_seconds;
  const idx = STAGES.indexOf(status);
  const queuedBehind = state?.active_runs.filter((r) => r.id < runId).length ?? 0;
  return (
    <div className="card card-pad space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rzp border-t-transparent" />
          <span className="text-sm font-semibold">Model running · {STATUS_LABEL[status] ?? status}</span>
          {status === 'queued' && queuedBehind > 0 && <span className="text-xs text-ink-faint">waiting for {queuedBehind} earlier run(s)</span>}
        </div>
        <div className="text-sm tabular-nums text-ink-soft">
          {Math.round(progress)}% · ETA {duration(eta)}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-rzp transition-all duration-500" style={{ width: `${Math.max(2, progress)}%` }} />
      </div>
      <ol className="grid grid-cols-5 gap-2 text-xs">
        {STAGES.map((s, i) => (
          <li
            key={s}
            className={`rounded-md border px-2 py-1.5 ${
              i < idx ? 'border-brand-200 bg-brand-50 text-brand-700' : i === idx ? 'border-rzp/40 bg-rzp-soft font-medium text-rzp' : 'border-line text-ink-faint'
            }`}
          >
            {i + 1}. {STATUS_LABEL[s]}
            <div className="text-2xs font-normal opacity-80">
              {s === 'scoring' ? 'ML model → predictions' : s === 'deciding' ? 'EV calculation → decisions' : s === 'drafting' ? 'LLM → messages' : s === 'queued' ? 'Waiting' : 'Merchant review'}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-faint">You can leave this page. Progress shows in the top bar and you&apos;ll get a notification when the run is ready.</p>
    </div>
  );
}
