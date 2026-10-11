import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DayPanel } from '@/components/day-panel';
import { AutoRefresh } from '@/components/live';
import { PageHeader } from '@/components/ui';
import { dayLabel, num, todayIST, weekday } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { codCost, daySummaries } from '@/lib/server/results.ts';

export const dynamic = 'force-dynamic';

const LONG_DAY: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const db = getDb();
  const [d] = await daySummaries(db, 1, date);
  if (!d) notFound();
  const today = todayIST();
  const cost = await codCost(db, d.ready > 0 ? d.ready : d.eligible);
  const ineligible = await db.query(
    `select coalesce(ineligible_reason, 'Eligible') as reason, count(*)::int as n from orders where batch_id = $1 group by 1 order by 2 desc`,
    [date],
  );
  return (
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        back={{ href: `/?date=${date}`, label: 'Back to Overview' }}
        title={`${d.date === today ? 'Today · ' : ''}${LONG_DAY[weekday(date)]}, ${dayLabel(date)}`}
        sub={`${num(d.total)} orders${d.date === today ? ' so far' : ''} · ${num(d.cod)} cash on delivery · ${num(d.eligible)} from repeat customers eligible for a campaign`}
        actions={
          <Link href={`/orders?date=${date}&back=${encodeURIComponent(`/day/${date}`)}`} className="btn">
            All orders for this day
          </Link>
        }
      />
      <div className="card overflow-hidden">
        <DayPanel d={d} today={today} cost={cost} back={`/day/${date}`} />
      </div>
      <div className="card px-5 py-4">
        <h2>Who is eligible, and why the rest are not</h2>
        <p className="mt-1 text-[12.5px] text-ink-faint">
          Campaigns only target repeat customers paying cash on delivery. First-time customers, prepaid orders and customers with a history of returns are left out.
        </p>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {ineligible.map((r) => (
            <div key={r.reason} className="rounded-lg bg-panel px-4 py-3">
              <div className="text-[12px] text-ink-soft">{r.reason === 'Eligible' ? 'Eligible repeat-customer COD' : r.reason}</div>
              <div className="metric-sm mt-0.5">{num(r.n)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
