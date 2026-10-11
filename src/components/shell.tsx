'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { duration, simTime, STATUS_LABEL } from '@/lib/format';
import { api, useLive } from './live';

const NAV = [
  { href: '/', label: 'Overview', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { href: '/runs', label: 'Runs', icon: 'M5 4l14 8-14 8z' },
  { href: '/messages', label: 'Messages', icon: 'M4 5h16v11H8l-4 4z' },
  { href: '/results', label: 'Results', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
];
const NAV_LOWER = [
  { href: '/data', label: 'Data', icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  { href: '/model', label: 'Model', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5' },
  { href: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function ConceptLabel({ className = '' }: { className?: string }) {
  return (
    <span className={`pill border border-amber-200 bg-amber-50 text-amber-800 ${className}`}>
      Concept prototype · synthetic data
    </span>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
        active ? 'bg-brand-600 font-medium text-white' : 'text-brand-100 hover:bg-brand-800 hover:text-white'
      }`}
    >
      <Icon d={icon} />
      {label}
    </Link>
  );
}

function Bell() {
  const { state, refreshState } = useLive();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const unread = state?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-sm relative"
        aria-label="Notifications"
        onClick={async () => {
          setOpen((o) => !o);
          if (!open && unread) {
            await api('/api/notifications/read', { method: 'POST' });
            await refreshState();
          }
        }}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rzp px-1 text-2xs font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-80 rounded-lg border border-line bg-white shadow-xl">
          <div className="border-b border-line px-3 py-2 text-xs font-semibold">Notifications</div>
          <div className="max-h-80 overflow-auto">
            {(state?.notifications ?? []).length === 0 && <div className="px-3 py-4 text-xs text-ink-faint">Nothing yet.</div>}
            {(state?.notifications ?? []).map((n) => (
              <a key={n.id} href={n.link ?? '#'} className="block border-b border-line px-3 py-2 text-xs last:border-0 hover:bg-canvas">
                <div className="text-ink">{n.message}</div>
                <div className="mt-0.5 text-2xs text-ink-faint">Sim {simTime(n.created_at)}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Clock() {
  const { state, setState, toast } = useLive();
  const [busy, setBusy] = useState(false);
  const owner = state?.role === 'owner';
  const act = async (action: 'pause' | 'resume' | 'advance') => {
    setBusy(true);
    try {
      setState(await api('/api/clock', { method: 'POST', json: { action } }));
      if (action === 'advance') toast('Advanced 1 sim day. Due outcomes resolved and the next batch arrived.', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-md border border-line bg-white px-2.5 py-1">
        <span className="text-xs text-ink-faint">Sim time</span>
        <span className="font-mono text-sm font-medium">{simTime(state?.sim_now)}</span>
        <span className={`pill ${state?.is_live ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-ink-soft'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${state?.is_live ? 'animate-pulse bg-brand-500' : 'bg-gray-400'}`} />
          {state?.is_live ? 'Live' : 'Paused'}
        </span>
      </div>
      <button
        className="btn btn-sm"
        disabled={busy || !owner}
        title={owner ? '' : 'Owner only'}
        onClick={() => act(state?.is_live ? 'pause' : 'resume')}
      >
        {state?.is_live ? 'Pause' : 'Resume'}
      </button>
      <button className="btn btn-sm" disabled={busy || !owner} title={owner ? '' : 'Owner only'} onClick={() => act('advance')}>
        {busy ? 'Working…' : 'Advance 1 day'}
      </button>
    </div>
  );
}

function RunIndicator() {
  const { state } = useLive();
  const runs = state?.active_runs ?? [];
  if (!runs.length) return null;
  const r = runs[0];
  return (
    <Link href={`/runs/${r.id}`} className="flex items-center gap-2 rounded-md border border-rzp/30 bg-rzp-soft px-2.5 py-1 text-xs text-rzp">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-rzp border-t-transparent" />
      <span className="font-medium">
        Run #{r.id} · {STATUS_LABEL[r.status]} {Math.round(r.progress)}%
      </span>
      {r.eta_seconds != null && <span className="text-rzp/80">ETA {duration(r.eta_seconds)}</span>}
      {runs.length > 1 && <span className="text-rzp/80">+{runs.length - 1} queued</span>}
    </Link>
  );
}

function RoleSwitch() {
  const { state, refreshState } = useLive();
  const router = useRouter();
  return (
    <select
      className="input py-1 text-xs"
      value={state?.role ?? 'owner'}
      onChange={async (e) => {
        await api('/api/role', { method: 'POST', json: { role: e.target.value } });
        await refreshState();
        router.refresh();
      }}
      aria-label="Role"
    >
      <option value="owner">Owner</option>
      <option value="analyst">Analyst</option>
    </select>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { state } = useLive();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col bg-brand-900 px-3 py-4">
        <div className="mb-6 px-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-sm font-bold text-white">V</span>
            <div>
              <div className="text-sm font-semibold text-white">{state?.merchant?.name ?? 'Verdant Daily'}</div>
              <div className="text-2xs text-brand-300">COD → Prepaid</div>
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>
        <div className="mb-2 mt-6 px-2.5 text-2xs font-medium uppercase tracking-wide text-brand-300">Data & model</div>
        <nav className="flex flex-col gap-0.5">
          {NAV_LOWER.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>
        <div className="mt-auto px-2 text-2xs text-brand-300">
          Powered by <span className="font-semibold text-white">Razorpay</span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-5 backdrop-blur">
          <div className="text-sm font-semibold">{state?.merchant?.name ?? 'Verdant Daily'}</div>
          <Clock />
          <RunIndicator />
          <div className="ml-auto flex items-center gap-2">
            <ConceptLabel />
            <Bell />
            <RoleSwitch />
            <span className="hidden text-2xs text-ink-faint xl:inline">
              Powered by <span className="font-semibold text-ink-soft">Razorpay</span>
            </span>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-5 py-5">{children}</main>
        <footer className="flex items-center justify-between border-t border-line px-5 py-3 text-2xs text-ink-faint">
          <span>Concept prototype · synthetic data · all metrics are simulated</span>
          <span>
            Powered by <span className="font-semibold text-ink-soft">Razorpay</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
