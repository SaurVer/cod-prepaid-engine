import { AutoRefresh, RefreshButton, SyncIfStale } from '@/components/live';
import { HeroDemo } from '@/components/hero-demo';
import { OverviewClient } from '@/components/overview';
import { PageHeader } from '@/components/ui';
import { getDb } from '@/lib/server/db.ts';
import { costInputs, daySummaries } from '@/lib/server/results.ts';
import { getMerchant } from '@/lib/server/settings.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const [days, cost, merchant] = await Promise.all([daySummaries(db, 30), costInputs(db), getMerchant(db)]);

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <SyncIfStale />
      <PageHeader
        title="Overview"
        sub={`Cash-on-delivery orders from ${merchant?.name ?? 'your'} repeat customers, and the campaigns that move them to prepaid.`}
        actions={<RefreshButton />}
      />
      <HeroDemo />

      <OverviewClient days={days} cost={cost} initial={{ date: sp.date, range: sp.range, show: sp.show, from: sp.from, to: sp.to }} />
    </div>
  );
}
