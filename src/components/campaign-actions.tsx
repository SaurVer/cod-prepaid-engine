'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dayLabel, duration, num, STATUS_LABEL } from '@/lib/format';
import { GroupsExplainer } from './explain';
import { api, useLive } from './live';

/** Run campaign: opens a dialog to set the control group and random test sizes, then starts the campaign. */
export function RunCampaignButton({
  date,
  ready,
  past,
  defaults,
  label = 'Run campaign',
}: {
  date: string;
  ready: number;
  past: boolean;
  defaults: { holdout_pct: number; exploration_pct: number };
  label?: string;
}) {
  const { refreshState, toast } = useLive();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [control, setControl] = useState(String(Math.round(defaults.holdout_pct * 100)));
  const [random, setRandom] = useState(String(Math.round(defaults.exploration_pct * 100)));
  const c = Number(control) / 100;
  const r = Number(random) / 100;
  const err =
    !(c >= 0.01 && c <= 0.5)
      ? 'Control group must be between 1% and 50%.'
      : !(r >= 0 && r <= 0.5)
        ? 'Random test must be between 0% and 50%.'
        : c + r > 0.6
          ? 'Control + random test can be at most 60%.'
          : null;
  const start = async () => {
    setBusy(true);
    try {
      const res = await api<{ id: number; orders: number; name: string; href: string }>('/api/campaigns', {
        method: 'POST',
        json: { date, holdout_pct: c, explore_pct: r },
      });
      toast(`${res.name} started on ${num(res.orders)} orders. Progress shows here; we'll tell you when it's ready to review.`, 'info', res.href);
      setOpen(false);
      await refreshState();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the campaign', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="btn btn-primary" disabled={ready === 0} onClick={() => setOpen(true)}>
        {label} on {num(ready)} orders
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <div className="card w-full max-w-[720px] px-6 py-5 shadow-pop" role="dialog" aria-modal="true" aria-label="Run campaign">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px]">
                  Run a campaign on {num(ready)} orders from {dayLabel(date)}
                </h2>
                <p className="mt-1 text-[12.5px] text-ink-soft">
                  The AI scores every order, picks an action and drafts the messages. Nothing is sent until you review and approve.
                </p>
              </div>
              <button className="btn btn-sm" onClick={() => setOpen(false)} disabled={busy} aria-label="Close">
                ✕
              </button>
            </div>
            {past && (
              <div className="mt-3 rounded-lg border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-warn">
                <b>This day has passed, so the campaign is a replay.</b> It runs as if the messages went out at 9 PM on {dayLabel(date)}. When you send it,
                customer responses, shipping and deliveries up to today are filled in straight away, so you see the result immediately.
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className="block">
                <span className="label">Control group</span>
                <div className="mt-1 flex items-center gap-2">
                  <input className="input w-24 text-right" type="number" min={1} max={50} value={control} onChange={(e) => setControl(e.target.value)} />
                  <span className="text-ink-soft">% of orders · about {num(Math.round(ready * (c || 0)))}</span>
                </div>
              </label>
              <label className="block">
                <span className="label">Random test</span>
                <div className="mt-1 flex items-center gap-2">
                  <input className="input w-24 text-right" type="number" min={0} max={50} value={random} onChange={(e) => setRandom(e.target.value)} />
                  <span className="text-ink-soft">% of orders · about {num(Math.round(ready * (r || 0)))}</span>
                </div>
              </label>
            </div>
            <div className="mt-4">
              <GroupsExplainer holdoutPct={c || 0} explorePct={r || 0} compact />
            </div>
            {err && <div className="mt-3 rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[12.5px] text-bad">{err}</div>}
            <div className="mt-5 flex items-center justify-between">
              <span className="text-[12px] text-ink-faint">Defaults come from Settings. These sizes apply to this campaign only.</span>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={start} disabled={busy || Boolean(err)}>
                  {busy ? 'Starting…' : 'Start campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
