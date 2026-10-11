import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { getAppState } from '@/lib/server/state.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const role = await getRole();
  return handle(() => getAppState(getDb(), role));
}
