import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { setReview } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const role = await getRole();
  const b = (await req.json()) as { runId: number; orderIds: number[]; review: 'approved' | 'rejected' | 'pending' };
  return handle(() => setReview(getDb(), Number(b.runId), (b.orderIds ?? []).map(Number), b.review, role), { tick: false });
}
