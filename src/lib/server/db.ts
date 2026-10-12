// Thin data-access layer. Production: node-postgres pool over DATABASE_URL (Supabase pooler).
// Local tests: PSQL_TEST_URL runs each statement through the psql CLI (no transactions).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = any;

export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

function normalise(v: any): any {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    const o: Row = {};
    for (const k of Object.keys(v)) o[k] = normalise(v[k]);
    return o;
  }
  return v;
}

// ---------- node-postgres driver ----------
let poolPromise: Promise<any> | null = null;

async function getPool(): Promise<any> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const pg: any = await import('pg');
      const lib = pg.default ?? pg;
      lib.types.setTypeParser(1700, (v: string) => (v === null ? null : parseFloat(v))); // numeric
      lib.types.setTypeParser(20, (v: string) => (v === null ? null : parseInt(v, 10))); // int8
      lib.types.setTypeParser(1082, (v: string) => v); // date
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('DATABASE_URL is not set');
      return new lib.Pool({
        connectionString: url,
        ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 6,
        idleTimeoutMillis: 10_000,
      });
    })();
  }
  return poolPromise;
}

function pgDb(client: any): Db {
  return {
    async query(sql, params = []) {
      const r = await client.query(sql, params);
      return normalise(r.rows);
    },
    async tx(fn) {
      return fn(this); // already inside a transaction
    },
  };
}

const pgRoot: Db = {
  async query(sql, params = []) {
    const pool = await getPool();
    const r = await pool.query(sql, params);
    return normalise(r.rows);
  },
  async tx(fn) {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const out = await fn(pgDb(client));
      await client.query('commit');
      return out;
    } catch (e) {
      try {
        await client.query('rollback');
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  },
};

// ---------- psql test driver ----------
function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) {
    const items = v.map((x) => {
      if (x === null || x === undefined) return 'NULL';
      const s = typeof x === 'object' ? JSON.stringify(x) : String(x);
      return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    });
    return `'{${items.join(',').replace(/'/g, "''")}}'`;
  }
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `'${s.replace(/'/g, "''")}'`;
}

export function inlineParams(sql: string, params: unknown[]): string {
  return sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
}

function psqlDb(url: string): Db {
  return {
    async query(sql, params = []) {
      const { spawnSync } = await import('node:child_process');
      const text = inlineParams(sql, params).trim().replace(/;\s*$/, '');
      const lower = text.toLowerCase();
      let wrapped: string;
      let returnsRows = true;
      if (/^\s*(select|with)\b/.test(lower) && !/\b(insert|update|delete)\b/.test(lower.split('select')[0])) {
        wrapped = `select coalesce(json_agg(t), '[]'::json) from (${text}) t`;
      } else if (/\breturning\b/.test(lower)) {
        wrapped = `with t as (${text}) select coalesce(json_agg(t), '[]'::json) from t`;
      } else {
        wrapped = text;
        returnsRows = false;
      }
      const r = spawnSync('psql', [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
        input: wrapped + ';\n',
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
      });
      if (r.status !== 0) throw new Error((r.stderr || String(r.error) || 'psql failed').trim());
      if (!returnsRows) return [];
      const out = r.stdout.trim();
      return out ? JSON.parse(out) : [];
    },
    async tx(fn) {
      return fn(this);
    },
  };
}

export function getDb(): Db {
  const test = process.env.PSQL_TEST_URL;
  return test ? psqlDb(test) : pgRoot;
}
