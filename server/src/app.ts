import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auth } from './routes/auth.js';
import { student } from './routes/student.js';
import { admin } from './routes/admin.js';
import { HttpError } from './http.js';
import { cacheBackend } from './cache.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, cache: cacheBackend }));
  app.use('/api/auth', auth);
  app.use('/api/admin', admin);
  app.use('/api', student);
  app.use('/api', (_req: Request, res: Response) => res.status(404).json({ error: 'ไม่พบ endpoint' }));

  // โหมด production: เสิร์ฟหน้าเว็บที่ build แล้วจาก client/dist
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = [process.env.CLIENT_DIST, path.join(here, '../../client/dist'), path.join(here, '../../../client/dist')]
    .find((p) => p && fs.existsSync(path.join(p, 'index.html')));
  if (dist) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if ((err as any).code === '23505') return res.status(409).json({ error: 'ข้อมูลซ้ำกับที่มีอยู่แล้ว' });
    if ((err as any).code === '23503') return res.status(409).json({ error: 'ข้อมูลถูกอ้างอิงอยู่ ลบหรือแก้ไขไม่ได้' });
    if ((err as any).type === 'entity.parse.failed') return res.status(400).json({ error: 'รูปแบบ JSON ไม่ถูกต้อง' });
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ' });
  });
  return app;
}
