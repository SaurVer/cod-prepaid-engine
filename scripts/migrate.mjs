// Applies db/migrations/*.sql in order over DATABASE_URL (or PSQL-compatible URL) using node-postgres.
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const client = new pg.Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
await client.connect();
await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())');
const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
for (const f of readdirSync('db/migrations').filter((x) => x.endsWith('.sql')).sort()) {
  if (done.has(f)) continue;
  console.log('applying', f);
  await client.query('begin');
  await client.query(readFileSync(`db/migrations/${f}`, 'utf8'));
  await client.query('insert into schema_migrations (name) values ($1)', [f]);
  await client.query('commit');
}
await client.end();
console.log('migrations up to date');
