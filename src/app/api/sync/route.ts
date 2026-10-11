import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { getAppState } from '@/lib/server/state.ts';
import { sync } from '@/lib/server/sync.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Refresh: pull orders that have arrived since the last sync, plus due customer responses and outcomes.
export async function POST() {
  const role = await getRole();
  return handle(async () => {
    const db = getDb();
    const r = await sync(db);
    return { ...(await getAppState(db, role)), added: r.added };
  });
}
