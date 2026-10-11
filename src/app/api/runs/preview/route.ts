import { getDb } from '@/lib/server/db.ts';
import { handle } from '@/lib/server/http.ts';
import { batchesForRun, previewRun } from '@/lib/server/pipeline.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get('batches') ?? '').split(',').filter(Boolean);
  return handle(async () => {
    const db = getDb();
    return { batches: await batchesForRun(db), preview: ids.length ? await previewRun(db, ids) : null };
  });
}
