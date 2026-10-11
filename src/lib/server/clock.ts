// Server-side sim clock with lazy ticks (section 3). Called on every API request and the 5-second poll.

import type { Db } from './db.ts';
import { DAY, dateKey } from './settings.ts';
import { ingestBatch, resolveUntil } from './simulation.ts';

export interface TickResult {
  ticked: boolean;
  sim_now: string | null;
  batches: string[];
  events: number;
  conversions: number;
  outcomes: number;
}

const MIN_STEP_MS = 60_000; // don't write for less than one sim minute

export async function tick(db: Db, opts: { advanceDay?: boolean } = {}): Promise<TickResult> {
  return db.tx(async (t) => {
    const rows = await t.query(`select * from system_settings where id = 1 for update skip locked`);
    const empty: TickResult = { ticked: false, sim_now: rows[0]?.sim_now ?? null, batches: [], events: 0, conversions: 0, outcomes: 0 };
    if (!rows.length) return empty;
    const s = rows[0];
    if (s.seed_status !== 'ready') return empty;

    const realNow = Date.now();
    const simNow = Date.parse(s.sim_now);
    let next = simNow;
    if (opts.advanceDay) {
      next = simNow + DAY;
    } else if (s.is_live) {
      const elapsed = Math.max(0, realNow - Date.parse(s.last_real_tick));
      const msPerSimMs = (Number(s.real_minutes_per_sim_day) * 60_000) / DAY;
      // at most one sim day of catch-up per tick; the clock only moves while the app is open
      next = simNow + Math.min(DAY, elapsed / msPerSimMs);
    }
    if (!opts.advanceDay && next - simNow < MIN_STEP_MS) {
      if (!s.is_live) await t.query(`update system_settings set last_real_tick = now() where id = 1`);
      return empty;
    }
    next = Math.floor(next / 1000) * 1000;

    const out: TickResult = { ticked: true, sim_now: new Date(next).toISOString(), batches: [], events: 0, conversions: 0, outcomes: 0 };
    // each day boundary crossed: resolve up to it, then the new day's batch arrives
    const firstBoundary = Math.floor(simNow / DAY) * DAY + DAY;
    for (let b = firstBoundary; b <= next; b += DAY) {
      const r = await resolveUntil(t, b);
      out.events += r.events;
      out.conversions += r.conversions;
      out.outcomes += r.outcomes;
      const batch = await ingestBatch(t, dateKey(b), b);
      if (batch) out.batches.push(batch.date);
    }
    const r = await resolveUntil(t, next);
    out.events += r.events;
    out.conversions += r.conversions;
    out.outcomes += r.outcomes;
    await t.query(`update system_settings set sim_now = $1, last_real_tick = now() where id = 1`, [out.sim_now]);
    return out;
  });
}

export async function setLive(db: Db, live: boolean): Promise<void> {
  await db.query(`update system_settings set is_live = $1, last_real_tick = now() where id = 1`, [live]);
}
