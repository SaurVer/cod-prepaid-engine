import { setLive, tick } from '@/lib/server/clock.ts';
import { getDb } from '@/lib/server/db.ts';
import { getRole, handle, requireOwner } from '@/lib/server/http.ts';
import { UserError } from '@/lib/server/pipeline.ts';
import { audit } from '@/lib/server/settings.ts';
import { getAppState } from '@/lib/server/state.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const role = await getRole();
  const { action } = (await req.json()) as { action: string };
  return handle(async () => {
    const db = getDb();
    if (action === 'pause' || action === 'resume') {
      requireOwner(role, action === 'pause' ? 'pause the clock' : 'resume the clock');
      await setLive(db, action === 'resume');
      await audit(db, role, action === 'pause' ? 'clock_pause' : 'clock_resume', 'sim_clock', null, null);
    } else if (action === 'advance') {
      requireOwner(role, 'advance the clock');
      const r = await tick(db, { advanceDay: true });
      if (!r.ticked) throw new UserError('The clock is busy. Try again in a moment.');
      await audit(db, role, 'clock_advance_day', 'sim_clock', null, { sim_now: r.sim_now, batches: r.batches });
    } else {
      throw new UserError('Unknown clock action.');
    }
    return getAppState(db, role);
  });
}
