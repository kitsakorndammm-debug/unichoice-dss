import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const SECRET = process.env.JWT_SECRET || 'dss-dev-secret-change-me';
const TTL_SEC = 60 * 60 * 24 * 7; // 7 วัน

// ---------- Password hashing (scrypt) ----------
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

// ---------- JWT (HS256) ----------
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export interface TokenPayload { sub: number; role: 'student' | 'admin'; name: string; exp?: number }

export function signJwt(payload: TokenPayload): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TTL_SEC }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string): TokenPayload | null {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  if (s.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expect))) return null;
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString()) as TokenPayload;
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}

// ---------- Middleware ----------
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: TokenPayload } }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : (req.query.token as string | undefined);
  const payload = token ? verifyJwt(token) : null;
  if (!payload) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  req.user = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'ต้องมีสิทธิ์ผู้ดูแลระบบ' });
  next();
}
