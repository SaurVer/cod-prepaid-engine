import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { tick } from './clock.ts';
import { getDb } from './db.ts';
import { UserError } from './pipeline.ts';

export type Role = 'owner' | 'analyst';

export async function getRole(): Promise<Role> {
  const c = await cookies();
  return c.get('role')?.value === 'analyst' ? 'analyst' : 'owner';
}

/** Run a handler after a lazy clock tick, mapping user errors to 400s. */
export async function handle(fn: () => Promise<unknown>, opts: { tick?: boolean } = { tick: true }) {
  try {
    if (opts.tick !== false) {
      try {
        await tick(getDb());
      } catch (e) {
        console.error('tick failed', e);
      }
    }
    const out = await fn();
    return NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('HARD_RULE')) {
      return NextResponse.json({ error: msg.replace(/^.*HARD_RULE:\s*/, 'Blocked by a hard rule: ') }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export function requireOwner(role: Role, what: string): void {
  if (role !== 'owner') throw new UserError(`Only the Owner can ${what}. Switch role or request approval.`);
}
