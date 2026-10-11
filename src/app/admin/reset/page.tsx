import { DewluneLogo, PoweredByRazorpay } from '@/components/logos';
import { SeedRunner } from '@/components/setup';

export const dynamic = 'force-dynamic';

// Master reset, deliberately outside the dashboard (not linked from the app). Needs ?token=<SETUP_TOKEN>.
export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const token = sp.token ?? '';
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="card w-full max-w-xl space-y-5 px-7 py-6">
        <div className="flex items-center justify-between">
          <DewluneLogo />
          <span className="pill bg-bad-soft text-bad">Admin · outside the app</span>
        </div>
        <div>
          <h1 className="text-[18px]">Reset the demo</h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            Wipes everything and rebuilds a fresh store: 15,000 customers, a training pilot, model v1, the last 29 days with an evening campaign on each, and
            today&apos;s orders so far with no campaign yet. Takes about 2–4 minutes.
          </p>
        </div>
        {token ? (
          <SeedRunner token={token} />
        ) : (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">Open this page with your setup token: /admin/reset?token=YOUR_TOKEN</p>
        )}
        <div className="border-t border-line pt-3">
          <PoweredByRazorpay />
        </div>
      </div>
    </div>
  );
}
