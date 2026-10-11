import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { createRun } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const role = await getRole();
  const body = (await req.json()) as { batchIds: string[] };
  // Analysts may create runs (Appendix D); sending still needs the Owner.
  return handle(() => createRun(getDb(), { batchIds: body.batchIds ?? [], role }));
}
