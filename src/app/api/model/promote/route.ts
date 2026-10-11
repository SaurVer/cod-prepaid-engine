import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { promoteModel } from '@/lib/server/model.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const role = await getRole();
  const { version } = (await req.json()) as { version: number };
  return handle(() => promoteModel(getDb(), Number(version), role));
}
