import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { editMessage, setReview } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const role = await getRole();
  const b = (await req.json()) as { runId: number; orderId?: number; text?: string; orderIds?: number[]; include?: boolean };
  // Include / exclude orders from sending (excluded messages are kept but not sent).
  if (Array.isArray(b.orderIds)) {
    return handle(() => setReview(getDb(), Number(b.runId), b.orderIds!.map(Number), b.include ? 'pending' : 'rejected', role));
  }
  return handle(() => editMessage(getDb(), Number(b.runId), Number(b.orderId), String(b.text ?? ''), role));
}
