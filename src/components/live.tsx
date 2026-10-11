'use client';

// App-wide live state: 5-second poll (which also ticks the sim clock), the run tracker that keeps
// processing chunks while the user moves around, toasts, and page refresh hooks.

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  setState: (s: AppState) => void;
  toast: (message: string, tone?: Toast['tone'], link?: string | null) => void;
  /** Bumps whenever the sim clock moves or a run changes; pages use it to refresh server data. */
  pulse: { clock: string | null; batch: string | null; runs: string };
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
  const [state, setState] = useState<AppState | null>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenNote = useRef<number>(initial?.notifications[0]?.id ?? 0);
  const processing = useRef(false);
  const toastId = useRef(1);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info', link: string | null = null) => {
    const id = toastId.current++;
    setToasts((t) => [...t, { id, message, link, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
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

  // 5-second poll
  useEffect(() => {
    const t = setInterval(refreshState, 5000);
    return () => clearInterval(t);
  }, [refreshState]);

  // Run tracker: keep calling the next chunk while any run is active.
  const hasActive = (state?.active_runs.length ?? 0) > 0;
  useEffect(() => {
    if (!hasActive || processing.current) return;
    processing.current = true;
    let stop = false;
    (async () => {
      let idleStreak = 0;
      while (!stop) {
        try {
          const r = await api<{ run_id: number | null; status: string; busy?: boolean }>('/api/runs/process', {
            method: 'POST',
          });
          if (r.status === 'idle') break;
          idleStreak = r.busy ? idleStreak + 1 : 0;
          await refreshState();
          await new Promise((res) => setTimeout(res, r.busy ? 1500 : 100));
          if (idleStreak > 60) break;
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Run processing failed', 'error');
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
      processing.current = false;
      await refreshState();
    })();
    return () => {
      stop = true;
    };
  }, [hasActive, refreshState, toast]);

  const pulse = {
    clock: state?.sim_now ?? null,
    batch: state?.latest_batch?.id ?? null,
    runs: (state?.active_runs ?? []).map((r) => `${r.id}:${r.status}`).join(',') + `|${state?.notifications[0]?.id ?? 0}`,
  };

  return (
    <Ctx.Provider value={{ state, refreshState, setState: apply, toast, pulse }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg ${
              t.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : t.tone === 'success'
                  ? 'border-brand-200 bg-white text-ink'
                  : 'border-line bg-white text-ink'
            }`}
          >
            <div>{t.message}</div>
            {t.link && (
              <a href={t.link} className="mt-1 inline-block text-xs font-medium text-rzp hover:underline">
                Open →
              </a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Calls router.refresh() when the chosen live signals change. */
export function AutoRefresh({ on }: { on: ('clock' | 'batch' | 'runs')[] }) {
  const { pulse } = useLive();
  const router = useRouter();
  const key = on.map((k) => pulse[k] ?? '').join('|');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.refresh();
  }, [key, router]);
  return null;
}
