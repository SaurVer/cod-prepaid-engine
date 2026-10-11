import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { editMessage } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const role = await getRole();
  const b = (await req.json()) as { runId: number; orderId: number; text: string };
  return handle(() => editMessage(getDb(), Number(b.runId), Number(b.orderId), String(b.text ?? ''), role), { tick: false });
}
