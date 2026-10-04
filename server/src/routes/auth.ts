import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db.js';
import { hashPassword, verifyPassword, signJwt, requireAuth } from '../security.js';
import { ah, parse } from '../http.js';

export const auth = Router();

const toUser = (u: any) => ({ user_id: u.user_id, name: u.name, email: u.email, role: u.role, phone: u.phone });

auth.post('/register', ah(async (req, res) => {
  const body = parse(req.body, z.object({
    name: z.string().trim().min(2, 'กรุณากรอกชื่อ'),
    email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
    password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
    phone: z.string().trim().max(15).optional(),
  }));
  if (await one(`SELECT 1 FROM users WHERE email = $1`, [body.email])) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });
  const u = await one(`INSERT INTO users (name, email, password, phone) VALUES ($1,$2,$3,$4) RETURNING *`,
    [body.name, body.email, hashPassword(body.password), body.phone || null]);
  await q(`INSERT INTO student_profile (user_id) VALUES ($1)`, [u.user_id]);
  res.status(201).json({ token: signJwt({ sub: u.user_id, role: u.role, name: u.name }), user: toUser(u) });
}));

auth.post('/login', ah(async (req, res) => {
  const body = parse(req.body, z.object({ email: z.string().trim().toLowerCase(), password: z.string() }));
  const u = await one(`SELECT * FROM users WHERE email = $1`, [body.email]);
  if (!u || !verifyPassword(body.password, u.password)) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  res.json({ token: signJwt({ sub: u.user_id, role: u.role, name: u.name }), user: toUser(u) });
}));

auth.get('/me', requireAuth, ah(async (req, res) => {
  const u = await one(`SELECT * FROM users WHERE user_id = $1`, [req.user!.sub]);
  if (!u) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ user: toUser(u) });
}));
