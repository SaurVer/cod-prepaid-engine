'use client';

// App-wide live state: Refresh (pulls new orders and responses from the backend), the campaign tracker
// that keeps processing chunks while the user moves around, notifications and toasts.

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { timeIST } from '@/lib/format';
import type { AppState } from '@/lib/server/state.ts';

interface Toast {
  id: number;
  message: string;
  link: string | null;
  tone: 'info' | 'success' | 'error';
}

interface LiveCtx {
  state: AppState | null;
  refreshState: () => Promise<void>;
  /** Pull new orders + customer responses, then re-render the page. */
  refreshAll: (opts?: { quiet?: boolean }) => Promise<void>;
  refreshing: boolean;
  toast: (message: string, tone?: Toast['tone'], link?: string | null) => void;
  runsKey: string;
}

const Ctx = createContext<LiveCtx | null>(null);

export function useLive(): LiveCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLive outside LiveProvider');
  return c;
}

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export function LiveProvider({ children, initial }: { children: React.ReactNode; initial: AppState | null }) {
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const seenNote = useRef<number>(initial?.notifications[0]?.id ?? 0);
  const processing = useRef(false);
  const toastId = useRef(1);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info', link: string | null = null) => {
    const id = toastId.current++;
    setToasts((t) => [...t, { id, message, link, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  }, []);

  const apply = useCallback(
    (s: AppState) => {
      setState(s);
      const fresh = s.notifications.filter((n) => n.id > seenNote.current);
      if (fresh.length) {
        seenNote.current = Math.max(...fresh.map((n) => n.id));
        for (const n of fresh.slice(0, 3).reverse()) toast(n.message, 'success', n.link);
      }
    },
    [toast],
  );

  const refreshState = useCallback(async () => {
    try {
      apply(await api<AppState>('/api/state'));
    } catch {
      /* transient */
    }
  }, [apply]);

  const refreshAll = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      setRefreshing(true);
      try {
        const r = await api<AppState & { added: number }>('/api/sync', { method: 'POST' });
        apply(r);
        router.refresh();
        if (!opts.quiet && r.added > 0) toast(`${r.added.toLocaleString('en-IN')} new orders arrived`, 'info');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Refresh failed', 'error');
      } finally {
        setRefreshing(false);
      }
    },
    [apply, router, toast],
  );

  // Light poll for campaign progress and notifications (does not pull new orders).
  useEffect(() => {
    const t = setInterval(refreshState, 5000);
    return () => clearInterval(t);
  }, [refreshState]);

  // Campaign tracker: keep processing chunks while any campaign is running.
  const hasActive = (state?.active_runs.length ?? 0) > 0;
  useEffect(() => {
    if (!hasActive || processing.current) return;
    processing.current = true;
    let stop = false;
    (async () => {
      let busyStreak = 0;
      while (!stop) {
        try {
          const r = await api<{ run_id: number | null; status: string; busy?: boolean }>('/api/runs/process', { method: 'POST' });
          if (r.status === 'idle') break;
          busyStreak = r.busy ? busyStreak + 1 : 0;
          await refreshState();
          if (r.status === 'ready_for_review') router.refresh();
          await new Promise((res) => setTimeout(res, r.busy ? 1500 : 100));
          if (busyStreak > 60) break;
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Campaign processing failed', 'error');
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
      processing.current = false;
      await refreshState();
    })();
    return () => {
      stop = true;
    };
  }, [hasActive, refreshState, toast, router]);

  const runsKey = (state?.active_runs ?? []).map((r) => `${r.id}:${r.status}`).join(',');

  return (
    <Ctx.Provider value={{ state, refreshState, refreshAll, refreshing, toast, runsKey }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[340px] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-[13px] shadow-pop ${
              t.tone === 'error' ? 'border-bad/30 bg-bad-soft text-bad' : 'border-line bg-white text-ink'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${t.tone === 'error' ? 'bg-bad' : t.tone === 'success' ? 'bg-ok' : 'bg-rzp'}`} />
              <div>
                <div>{t.message}</div>
                {t.link && (
                  <a href={t.link} className="mt-1 inline-block text-xs font-medium text-rzp hover:underline">
                    Open →
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Re-render server data when campaign states change (progress, ready). */
export function AutoRefresh() {
  const { runsKey } = useLive();
  const router = useRouter();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.refresh();
  }, [runsKey, router]);
  return null;
}

/** While customer responses are arriving after a send, pull them every `everyMs` until `untilIso`. */
export function TrackResponses({ untilIso, everyMs = 8000 }: { untilIso: string | null; everyMs?: number }) {
  const { refreshAll } = useLive();
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!untilIso) return;
    const until = Date.parse(untilIso);
    const tick = () => setLeft(Math.max(0, Math.round((until - Date.now()) / 1000)));
    tick();
    if (Date.now() > until) return;
    const t = setInterval(() => {
      tick();
      if (Date.now() <= until) refreshAll({ quiet: true });
    }, everyMs);
    return () => clearInterval(t);
  }, [untilIso, everyMs, refreshAll]);
  if (!untilIso || left <= 0) return null;
  return (
    <span className="pill bg-rzp-soft text-rzp">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rzp" /> Customer responses arriving · auto-updating
    </span>
  );
}

/** Refresh: pull new orders, customer responses and deliveries. Lives on the Overview only. */
export function RefreshButton({ light = false }: { light?: boolean }) {
  const { state, refreshAll, refreshing } = useLive();
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[12px] ${light ? 'text-white/60' : 'text-ink-faint'}`}>Updated {timeIST(state?.last_synced)}</span>
      <button
        className={`btn btn-sm ${light ? '!border-white/20 !bg-white/10 !text-white hover:!bg-white/20' : ''}`}
        onClick={() => refreshAll()}
        disabled={refreshing}
        title="Pull new orders, customer responses and deliveries"
      >
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
