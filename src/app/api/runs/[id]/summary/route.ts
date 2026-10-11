import { getDb } from '@/lib/server/db.ts';
import { handle } from '@/lib/server/http.ts';
import { approvalSummary } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(() => approvalSummary(getDb(), Number(id)));
}
