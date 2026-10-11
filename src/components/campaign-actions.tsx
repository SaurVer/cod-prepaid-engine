'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { duration, num, STATUS_LABEL } from '@/lib/format';
import { api, useLive } from './live';

export function RunCampaignButton({ date, ready, label = 'Run campaign' }: { date: string; ready: number; label?: string }) {
  const { refreshState, toast } = useLive();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-primary"
      disabled={busy || ready === 0}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ id: number; orders: number; name: string }>('/api/campaigns', { method: 'POST', json: { date } });
          toast(`${r.name} started on ${num(r.orders)} orders. You can keep working; we'll tell you when it's ready.`, 'info');
          await refreshState();
          router.refresh();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Could not start the campaign', 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Starting…' : `${label} on ${num(ready)} orders`}
    </button>
  );
}

const STAGES = [
  { key: 'scoring', label: 'Scoring orders', sub: 'AI model predicts how each customer will respond' },
  { key: 'deciding', label: 'Choosing actions', sub: 'Picks the most profitable action per order' },
  { key: 'drafting', label: 'Writing messages', sub: 'AI drafts each message in your brand tone' },
  { key: 'ready_for_review', label: 'Ready to review', sub: 'You check and send' },
];

/** Live progress for a running campaign (reads the shared poll, so it updates on any page). */
export function CampaignProgress({ runId, initial }: { runId: number; initial: { status: string; progress: number; eta_seconds: number | null } }) {
  const { state } = useLive();
  const live = state?.active_runs.find((r) => r.id === runId);
  const status = live?.status ?? initial.status;
  const progress = live?.progress ?? initial.progress;
  const eta = live?.eta_seconds ?? initial.eta_seconds;
  const idx = STAGES.findIndex((s) => s.key === status);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[13px]">
        <div className="flex items-center gap-2 font-medium">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rzp border-t-transparent" />
          {status === 'queued' ? 'Waiting to start' : STATUS_LABEL[status]}
        </div>
        <div className="tabular-nums text-ink-soft">
          {Math.round(progress)}% {eta != null && <>· about {duration(eta)} left</>}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel">
        <div className="h-full rounded-full bg-rzp transition-all duration-700" style={{ width: `${Math.max(3, progress)}%` }} />
      </div>
      <ol className="grid grid-cols-4 gap-2">
        {STAGES.map((s, i) => (
          <li
            key={s.key}
            className={`rounded-lg border px-3 py-2 text-[12px] ${
              i < idx ? 'border-ok/25 bg-ok-soft text-ok' : i === idx ? 'border-rzp/30 bg-rzp-soft text-rzp' : 'border-line text-ink-faint'
            }`}
          >
            <div className="font-medium">
              {i < idx ? '✓ ' : ''}
              {s.label}
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">{s.sub}</div>
          </li>
        ))}
      </ol>
      <p className="text-[12px] text-ink-faint">You can leave this page. Progress shows in the top bar and you&apos;ll get a notification when it&apos;s ready.</p>
    </div>
  );
}

export function ReviewLink({ href }: { href: string }) {
  return (
    <Link href={href} className="btn btn-primary">
      Review &amp; send →
    </Link>
  );
}
