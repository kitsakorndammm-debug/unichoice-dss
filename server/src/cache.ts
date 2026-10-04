/**
 * แคชผลการคำนวณ SAW — ใช้ Redis ถ้ามี REDIS_URL, ไม่งั้นใช้หน่วยความจำ (Map)
 * dataVersion จะเพิ่มทุกครั้งที่ Admin แก้ข้อมูล ทำให้แคชเก่าใช้ไม่ได้อัตโนมัติ
 */
import crypto from 'node:crypto';

type Store = { get(k: string): Promise<string | null>; set(k: string, v: string, ttl: number): Promise<void>; incr(k: string): Promise<number> };

const mem = new Map<string, { v: string; exp: number }>();
const memoryStore: Store = {
  async get(k) { const e = mem.get(k); if (!e || e.exp < Date.now()) return null; return e.v; },
  async set(k, v, ttl) { if (mem.size > 2000) mem.clear(); mem.set(k, { v, exp: Date.now() + ttl * 1000 }); },
  async incr(k) { const n = Number((await this.get(k)) ?? 0) + 1; mem.set(k, { v: String(n), exp: Infinity }); return n; },
};

let store: Store = memoryStore;
export let cacheBackend = 'memory';

export async function initCache() {
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const mod = await import('redis');
    const client = mod.createClient({ url });
    client.on('error', () => {});
    await client.connect();
    store = {
      get: (k) => client.get(k),
      set: async (k, v, ttl) => { await client.set(k, v, { EX: ttl }); },
      incr: (k) => client.incr(k),
    };
    cacheBackend = 'redis';
  } catch (e) {
    console.warn('[cache] เชื่อมต่อ Redis ไม่ได้ ใช้ memory cache แทน:', (e as Error).message);
  }
}

let version = 0;
export async function bumpDataVersion() { version = await store.incr('dss:data-version'); }
async function currentVersion() { return Number((await store.get('dss:data-version')) ?? version); }

export async function cached<T>(parts: unknown, ttlSec: number, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const v = await currentVersion();
  const key = 'dss:eval:' + crypto.createHash('sha1').update(JSON.stringify([v, parts])).digest('hex');
  const hit = await store.get(key);
  if (hit) return { value: JSON.parse(hit) as T, hit: true };
  const value = await compute();
  await store.set(key, JSON.stringify(value), ttlSec);
  return { value, hit: false };
}
