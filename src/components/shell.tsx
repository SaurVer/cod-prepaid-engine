'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { duration, timeIST, STATUS_LABEL } from '@/lib/format';
import { api, useLive } from './live';
import { BrandLogo, ConceptLabel, PayShiftMark, PoweredByRazorpay } from './logos';

export { ConceptLabel } from './logos';

const NAV = [
  { href: '/', label: 'Overview', icon: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z' },
  { href: '/campaigns', label: 'Campaigns', icon: 'M3 11l15-6v14L3 13zM7 12.5V18a2 2 0 004 0v-4.2M21 9v4' },
  { href: '/orders', label: 'Orders', icon: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8' },
  { href: '/model', label: 'Model', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5' },
  { href: '/settings', label: 'Settings', icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' || path.startsWith('/day') : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
        active ? 'bg-white/10 font-medium text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className={active ? 'text-[#7EA0FF]' : ''}>
        <Icon d={icon} />
      </span>
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
        className="btn btn-sm relative h-8 w-8 !p-0"
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
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[340px] overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          <div className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">Notifications</div>
          <div className="max-h-96 overflow-auto">
            {(state?.notifications ?? []).length === 0 && <div className="px-4 py-5 text-xs text-ink-faint">Nothing yet.</div>}
            {(state?.notifications ?? []).map((n) => (
              <a key={n.id} href={n.link ?? '#'} className="block border-b border-line px-4 py-2.5 text-[12.5px] last:border-0 hover:bg-rzp-faint">
                <div className="text-ink">{n.message}</div>
                <div className="mt-0.5 text-[11px] text-ink-faint">{timeIST(n.created_real_at)}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignIndicator() {
  const { state } = useLive();
  const runs = state?.active_runs ?? [];
  if (!runs.length) return null;
  const r = runs[0];
  return (
    <Link href={r.href} className="flex items-center gap-2 rounded-lg border border-rzp/25 bg-rzp-soft px-3 py-1.5 text-[12px] text-rzp">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-rzp border-t-transparent" />
      <span className="font-medium">
        Campaign running · {STATUS_LABEL[r.status]} {Math.round(r.progress)}%
      </span>
      {r.eta_seconds != null && <span className="opacity-75">· about {duration(r.eta_seconds)} left</span>}
    </Link>
  );
}

function RoleSwitch() {
  const { state, refreshState } = useLive();
  const router = useRouter();
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
      Viewing as
      <select
        className="input py-1 text-[12px]"
        value={state?.role ?? 'owner'}
        onChange={async (e) => {
          await api('/api/role', { method: 'POST', json: { role: e.target.value } });
          await refreshState();
          router.refresh();
        }}
      >
        <option value="owner">Owner</option>
        <option value="analyst">Analyst</option>
      </select>
    </label>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col bg-rzp-navy px-3 py-5">
        <div className="mb-7 px-2">
          <BrandLogo light />
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <div className="rounded-lg bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-white/55">
            <b className="font-semibold text-white/80">PayShift</b> picks the most profitable way to move each COD order to prepaid, on your own order data.
          </div>
          <PoweredByRazorpay light />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-6 backdrop-blur">
          <Link href="/" className="flex items-center gap-2" title="PayShift · COD to prepaid">
            <PayShiftMark />
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">PayShift</span>
            <span className="text-[12px] text-ink-faint">COD → Prepaid</span>
          </Link>
          <CampaignIndicator />
          <div className="ml-auto flex items-center gap-3">
            <ConceptLabel />
            <Bell />
            <RoleSwitch />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
        <footer className="flex items-center justify-between border-t border-line px-6 py-3 text-[11px] text-ink-faint">
          <span>Concept prototype · synthetic data · all results are simulated</span>
          <PoweredByRazorpay />
        </footer>
      </div>
    </div>
  );
}
