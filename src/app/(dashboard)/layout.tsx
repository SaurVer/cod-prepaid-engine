import { LiveProvider } from '@/components/live';
import { ConceptLabel, Shell } from '@/components/shell';
import { SeedRunner } from '@/components/setup';
import { tick } from '@/lib/server/clock.ts';
import { getDb } from '@/lib/server/db.ts';
import { getRole } from '@/lib/server/http.ts';
import { type AppState, getAppState } from '@/lib/server/state.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  let state: AppState | null = null;
  let error: string | null = null;
  try {
    const db = getDb();
    await tick(db).catch(() => null);
    state = await getAppState(db, role);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!state || !state.seeded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="card card-pad w-full max-w-lg space-y-4">
          <div className="flex items-center justify-between">
            <h1>Verdant Daily · COD → Prepaid</h1>
            <ConceptLabel />
          </div>
          <p className="text-sm text-ink-soft">
            The demo database is empty. Setting up creates 15,000 synthetic customers, a 30-day randomised pilot, trains
            model v1 and brings in today&apos;s order batch. It takes under a minute.
          </p>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              Database not reachable: {error}
            </div>
          )}
          <SeedRunner needsToken={false} />
          <p className="text-2xs text-ink-faint">Powered by Razorpay</p>
        </div>
      </div>
    );
  }

  return (
    <LiveProvider initial={state}>
      <Shell>{children}</Shell>
    </LiveProvider>
  );
}
