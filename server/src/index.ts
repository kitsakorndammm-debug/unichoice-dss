import { createApp } from './app.js';
import { ensureDatabase } from './seed.js';
import { initCache, cacheBackend } from './cache.js';

const PORT = Number(process.env.PORT || 4000);

async function main() {
  // รอฐานข้อมูลพร้อม (สำคัญตอนรันด้วย docker compose)
  for (let i = 1; ; i++) {
    try { await ensureDatabase(); break; } catch (e) {
      if (i >= 20) throw e;
      console.log(`[db] รอฐานข้อมูล... (${i}) ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await initCache();
  createApp().listen(PORT, () => console.log(`✔ DSS API พร้อมใช้งานที่ http://localhost:${PORT}  (cache: ${cacheBackend})`));
}

main().catch((e) => { console.error(e); process.exit(1); });
