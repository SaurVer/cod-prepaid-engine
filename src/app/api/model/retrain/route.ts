import { getDb } from '@/lib/server/db.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { startRetrain, trainingStep } from '@/lib/server/model.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const role = await getRole();
  const { action } = (await req.json()) as { action: 'start' | 'step' };
  return handle(() => (action === 'start' ? startRetrain(getDb(), role) : trainingStep(getDb())));
}
