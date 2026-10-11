import Link from 'next/link';
import { AutoRefresh, RefreshButton } from '@/components/live';
import { PayShiftMark } from '@/components/logos';
import { OverviewClient } from '@/components/overview';
import { getDb } from '@/lib/server/db.ts';
import { costInputs, daySummaries } from '@/lib/server/results.ts';
import { getMerchant } from '@/lib/server/settings.ts';
import { syncIfStale } from '@/lib/server/sync.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STEPS = [
  ['Pick a day', 'Today’s orders, or replay any of the last 30 days.'],
  ['AI scores & decides', 'Predicts each customer’s response and picks the most profitable action.'],
  ['You review & send', 'Check the messages, edit any, then approve. Nothing goes out before.'],
  ['Measure vs control', 'A random no-message group shows what the campaign really earned.'],
];

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  // Pull orders that arrived since the last visit, at most every 30 seconds (Refresh forces it).
  await syncIfStale(db, 30_000);
  const [days, cost, merchant] = await Promise.all([daySummaries(db, 30), costInputs(db), getMerchant(db)]);

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <section className="relative overflow-hidden rounded-2xl bg-rzp-navy px-7 pb-6 pt-6 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-rzp/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-40 h-64 w-64 rounded-full bg-[#7EA0FF]/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-8">
          <div className="max-w-[700px]">
            <div className="flex items-center gap-2 text-[12px] font-medium text-white/70">
              <PayShiftMark light size={20} />
              PayShift <span className="text-white/40">·</span> COD → Prepaid for {merchant?.name ?? 'your store'}
            </div>
            <h1 className="mt-3 text-[27px] font-semibold leading-tight tracking-[-0.02em] text-white">
              Turn cash-on-delivery orders into prepaid, only where it pays.
            </h1>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/70">
              PayShift looks at every COD order from a repeat customer, predicts how that customer will respond, and picks the most profitable move: no message,
              a reminder to pay online, or a ₹50 off offer. You approve before anything is sent, and a random control group proves what it earned.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            <RefreshButton light />
            <Link href="/model" className="text-[12px] font-medium text-white/70 hover:text-white">
              How the AI decides →
            </Link>
          </div>
        </div>
        <ol className="relative mt-5 grid grid-cols-4 gap-3">
          {STEPS.map(([t, s], i) => (
            <li key={t} className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rzp text-[11px]">{i + 1}</span>
                {t}
              </div>
              <p className="mt-1 text-[12px] leading-snug text-white/60">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <OverviewClient days={days} cost={cost} initial={{ date: sp.date, range: sp.range, show: sp.show, from: sp.from, to: sp.to }} />
    </div>
  );
}
