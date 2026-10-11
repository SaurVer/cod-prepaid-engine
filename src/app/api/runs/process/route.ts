import { getDb } from '@/lib/server/db.ts';
import { handle } from '@/lib/server/http.ts';
import { processNext } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  return handle(() => processNext(getDb()));
}
