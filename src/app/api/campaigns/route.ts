import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { createRun } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Run a campaign on a day's new eligible orders. Analysts may create campaigns; sending needs the Owner.
export async function POST(req: Request) {
  const role = await getRole();
  const { date } = (await req.json()) as { date: string };
  return handle(() => createRun(getDb(), { batchIds: [date], role }), { sync: true });
}
