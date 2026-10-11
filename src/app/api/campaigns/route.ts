import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { createRun } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Run a campaign on a day's orders. Analysts may create campaigns; sending needs the Owner.
// Control group and random test sizes can be set per campaign (fractions, e.g. 0.1 = 10%).
export async function POST(req: Request) {
  const role = await getRole();
  const body = (await req.json()) as { date: string; holdout_pct?: number; explore_pct?: number };
  const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
  return handle(
    () => createRun(getDb(), { date: body.date, role, holdoutPct: num(body.holdout_pct), explorePct: num(body.explore_pct) }),
    { sync: true },
  );
}
