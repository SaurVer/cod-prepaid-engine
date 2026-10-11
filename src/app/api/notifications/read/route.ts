import { getDb } from '@/lib/server/db.ts';
import { handle } from '@/lib/server/http.ts';

export const dynamic = 'force-dynamic';

export async function POST() {
  return handle(() => getDb().query(`update notifications set read = true where not read`).then(() => ({ ok: true })), {
    tick: false,
  });
}
