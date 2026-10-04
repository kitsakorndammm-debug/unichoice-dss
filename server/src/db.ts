import './env.js';
import pg from 'pg';

// NUMERIC และ BIGINT (เช่น COUNT(*)) ให้คืนค่าเป็น number แทน string
pg.types.setTypeParser(1700, (v: string) => parseFloat(v));
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://dss:dss@localhost:5432/dss',
  max: 10,
});

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

/** รันหลายคำสั่งใน transaction เดียว */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
