import { getDb } from '@/lib/server/db.ts';
import { handle } from '@/lib/server/http.ts';
import { clearModelCache } from '@/lib/server/model.ts';
import { UserError } from '@/lib/server/pipeline.ts';
import { SEED_STEPS, type SeedStep, runSeedStep } from '@/lib/server/seed.ts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function run(step: string | null, token: string | null) {
  return handle(
    async () => {
      if (!step || !SEED_STEPS.includes(step as SeedStep)) throw new UserError('Unknown setup step.');
      const db = getDb();
      // First-time setup on an empty database needs no token; resetting existing data does.
      let hasData = false;
      try {
        const r = await db.query(`select seed_status from system_settings where id = 1`);
        hasData = r.length > 0 && r[0].seed_status === 'ready';
      } catch {
        hasData = false;
      }
      const required = process.env.SETUP_TOKEN;
      if (hasData && step === 'reset' && required && token !== required) {
        throw new UserError('Reset needs the setup token.');
      }
      if (step === 'reset') clearModelCache();
      const message = await runSeedStep(db, step as SeedStep);
      const i = SEED_STEPS.indexOf(step as SeedStep);
      return { step, message, next: SEED_STEPS[i + 1] ?? null };
    },
    { tick: false },
  );
}

export async function POST(req: Request) {
  const b = (await req.json()) as { step?: string; token?: string };
  return run(b.step ?? null, b.token ?? null);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  return run(u.searchParams.get('step'), u.searchParams.get('token'));
}
