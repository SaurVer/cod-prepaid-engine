import { getDb } from '@/lib/server/db.ts';
import { UserError } from '@/lib/server/errors.ts';
import { getRole, handle } from '@/lib/server/http.ts';
import { setIntegration } from '@/lib/server/settings.ts';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const role = await getRole();
  const { key, consent } = (await req.json()) as { key: string; consent: boolean };
  return handle(async () => {
    if (role !== 'owner') throw new UserError('Only the Owner can change integrations.');
    await setIntegration(getDb(), role, key, Boolean(consent));
    return { ok: true };
  });
}
