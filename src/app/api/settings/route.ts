import { getDb } from '@/lib/server/db.ts';
import { UserError } from '@/lib/server/errors.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { saveSettings } from '@/lib/server/settings.ts';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const role = await getRole();
  const patch = (await req.json()) as Record<string, unknown>;
  return handle(async () => {
    if (role !== 'owner') throw new UserError('Only the Owner can change settings.');
    return saveSettings(getDb(), role, patch);
  });
}
