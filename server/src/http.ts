import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny, output } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** ห่อ async handler ให้ส่ง error เข้า middleware */
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function parse<S extends ZodTypeAny>(data: unknown, schema: S): output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => i.message).join(', '));
  return r.data;
}

export const idParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'รหัสไม่ถูกต้อง');
  return n;
};
