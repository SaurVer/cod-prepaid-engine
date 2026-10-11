import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { requestApproval } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const role = await getRole();
  return handle(() => requestApproval(getDb(), Number(id), role));
}
