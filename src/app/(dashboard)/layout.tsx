import { LiveProvider } from '@/components/live';
import { ConceptLabel, BrandLogo } from '@/components/logos';
import { Shell } from '@/components/shell';
import { getDb } from '@/lib/server/db.ts';
import { getRole } from '@/lib/server/http.ts';
import { type AppState, getAppState } from '@/lib/server/state.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  let state: AppState | null = null;
  let error: string | null = null;
  try {
    const db = getDb();
    state = await getAppState(db, role);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (!state || !state.seeded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="card w-full max-w-lg space-y-4 px-7 py-6">
          <div className="flex items-center justify-between">
            <BrandLogo />
            <ConceptLabel />
          </div>
          <p className="text-[13px] text-ink-soft">
            {state?.seed_status === 'seeding'
              ? 'The demo data is being rebuilt. This page will work again in a couple of minutes.'
              : 'The demo data is not set up yet. Open the reset link (/admin/reset?token=…) to build it.'}
          </p>
          {error && <div className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2 text-[12px] text-bad">Database not reachable: {error}</div>}
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
