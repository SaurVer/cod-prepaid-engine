// Real-time sync (replaces the simulated clock). Runs on page load and on Refresh:
// tops today's orders up to what should have arrived by now, starts new IST dates after midnight,
// and resolves customer responses, dispatch and delivery outcomes that are due.

import type { Db } from './db.ts';
import { DAY, addDays, dayCurve, istDate, istDayStart } from './settings.ts';
import { addOrders, ensureDay, resolveUntil } from './simulation.ts';

export interface SyncResult {
  synced: boolean;
  now: string;
  added: number;
  events: number;
  conversions: number;
  outcomes: number;
}

/** Bring one IST date's orders up to `untilMs`. */
export async function fillDay(db: Db, date: string, untilMs: number) {
  const start = istDayStart(date);
  const end = start + DAY;
  const upTo = Math.min(untilMs, end);
  const batch = await ensureDay(db, date, start);
  const target = Math.round(Number(batch.planned_total) * dayCurve(upTo - start));
  const have = Number(batch.total_orders);
  if (target <= have) return 0;
  const from = Math.max(start, batch.last_order_at ? Date.parse(batch.last_order_at) + 1000 : start);
  const r = await addOrders(db, date, target - have, Math.min(from, upTo), upTo);
  return r.added;
}

export async function sync(db: Db, nowMs = Date.now()): Promise<SyncResult> {
  return db.tx(async (t) => {
    const out: SyncResult = { synced: false, now: new Date(nowMs).toISOString(), added: 0, events: 0, conversions: 0, outcomes: 0 };
    const [lock] = await t.query(`select pg_try_advisory_xact_lock(4242) as ok`);
    if (lock && lock.ok === false) return out;
    const [s] = await t.query(`select * from system_settings where id = 1`);
    if (!s || s.seed_status !== 'ready') return out;
    const last = Date.parse(s.sim_now);
    // Walk every IST date from the last sync to today, so a missed midnight is filled in.
    let date = istDate(last);
    const today = istDate(nowMs);
    let guard = 0;
    while (date <= today && guard++ < 40) {
      const end = istDayStart(date) + DAY;
      out.added += await fillDay(t, date, nowMs);
      if (date < today) {
        const r = await resolveUntil(t, end);
        out.events += r.events;
        out.conversions += r.conversions;
        out.outcomes += r.outcomes;
      }
      date = addDays(date, 1);
    }
    const r = await resolveUntil(t, nowMs);
    out.events += r.events;
    out.conversions += r.conversions;
    out.outcomes += r.outcomes;
    await t.query(`update system_settings set sim_now = $1, last_real_tick = now() where id = 1`, [out.now]);
    out.synced = true;
    return out;
  });
}

/** Sync only if the last one is older than `maxAgeMs` (keeps page loads fast). */
export async function syncIfStale(db: Db, maxAgeMs = 30_000): Promise<SyncResult | null> {
  const [s] = await db.query(`select last_real_tick from system_settings where id = 1`);
  if (s?.last_real_tick && Date.now() - Date.parse(s.last_real_tick) < maxAgeMs) return null;
  return sync(db).catch((e) => {
    console.error('sync failed', e);
    return null;
  });
}
