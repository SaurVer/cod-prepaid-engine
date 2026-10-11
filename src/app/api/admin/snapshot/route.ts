import { getDb } from '@/lib/server/db.ts';
import { handle } from '@/lib/server/http.ts';
import { UserError } from '@/lib/server/errors.ts';

export const dynamic = 'force-dynamic';

// Temporary QA helper: stores a base64 screenshot so the builder can review the UI. Token-protected.
export async function POST(req: Request) {
  const b = (await req.json()) as { token?: string; name?: string; data?: string };
  return handle(async () => {
    if (!process.env.SETUP_TOKEN || b.token !== process.env.SETUP_TOKEN) throw new UserError('Not allowed.');
    await getDb().query(`insert into qa_snapshots (name, data) values ($1, $2)`, [b.name ?? 'shot', b.data ?? '']);
    return { ok: true };
  });
}
