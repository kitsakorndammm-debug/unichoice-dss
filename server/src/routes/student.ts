import { Router } from 'express';
import { z } from 'zod';
import { q, one } from '../db.js';
import { requireAuth } from '../security.js';
import { ah, parse, idParam, HttpError } from '../http.js';
import { PROGRAM_SELECT, loadCriteria, getProfile, getWeights, saveWeights, runEvaluation, loadRun } from '../service.js';
import { renderReport } from '../report.js';
import { homeDistance } from '../saw.js';
import { REGIONS, FIELDS } from '../../db/data.js';
import { SUBJECTS, SUBJECT_KEYS } from '../subjects.js';
import { PROVINCE_NAMES, PROVINCES } from '../geo.js';

const ANY = 'ทั้งหมด';

export const student = Router();
student.use(requireAuth);

// ---------- ข้อมูลตั้งต้นสำหรับฟอร์ม ----------
student.get('/meta', ah(async (_req, res) => {
  const unis = await q(`SELECT uni_id, uni_name, short_name, region, type, province, lat, lng FROM university ORDER BY uni_name`);
  res.json({ regions: REGIONS, fields: FIELDS, provinces: PROVINCE_NAMES, provinceCoords: PROVINCES, universities: unis, subjects: SUBJECTS });
}));

// ---------- FR-02 โปรไฟล์ ----------
const profileSchema = z.object({
  gpa: z.coerce.number().min(0, 'GPA 0.00–4.00').max(4, 'GPA 0.00–4.00').nullable(),
  exam_score: z.coerce.number().min(0, 'คะแนนสอบ 0–100').max(100, 'คะแนนสอบ 0–100').nullable(),
  budget: z.coerce.number().min(0, 'งบประมาณต้องไม่ติดลบ').nullable(),
  preferred_region: z.string().refine((v) => v === ANY || (REGIONS as readonly string[]).includes(v), 'ภูมิภาคไม่อยู่ในรายการ').nullable(),
  interest_field: z.string().refine((v) => v === ANY || (FIELDS as string[]).includes(v), 'สาขาไม่อยู่ในรายการ').nullable(),
  home_province: z.string().refine((v) => v in PROVINCES, 'จังหวัดไม่อยู่ในรายการ').nullable(),
  // ตำแหน่งจริงจากเบราว์เซอร์ ปัดเหลือทศนิยม 3 ตำแหน่ง (ราว 100 ม.) ไม่เก็บละเอียดเกินจำเป็น
  home_lat: z.coerce.number().min(-90).max(90).transform((v) => Math.round(v * 1000) / 1000).nullable(),
  home_lng: z.coerce.number().min(-180).max(180).transform((v) => Math.round(v * 1000) / 1000).nullable(),
  // คะแนนรายวิชา (ไม่บังคับ): ส่งเฉพาะวิชาที่มีคะแนน ช่องว่าง/null ถูกตัดทิ้ง ไม่มีเลย = null
  subject_scores: z.record(z.string(), z.union([z.null(), z.literal(''), z.coerce.number().min(0, 'คะแนนรายวิชา 0–100').max(100, 'คะแนนรายวิชา 0–100')]))
    .refine((o) => Object.keys(o).every((k) => (SUBJECT_KEYS as string[]).includes(k)), 'วิชาไม่อยู่ในรายการ')
    .transform((o) => { const e = Object.entries(o).filter(([, v]) => v !== null && v !== '') as [string, number][]; return e.length ? Object.fromEntries(e) : null; })
    .nullable(),
});

student.get('/profile', ah(async (req, res) => {
  const user = await one(`SELECT user_id, name, email, phone, role FROM users WHERE user_id = $1`, [req.user!.sub]);
  res.json({ user, profile: await getProfile(req.user!.sub) });
}));

student.put('/profile', ah(async (req, res) => {
  const p = parse(req.body, profileSchema.partial().extend({ name: z.string().trim().min(2).optional(), phone: z.string().max(15).nullable().optional() }));
  const cur = await getProfile(req.user!.sub);
  const m = { ...cur, ...p };
  // ตำแหน่งจริงต้องมาครบทั้งคู่ ไม่งั้นถือว่าไม่มี
  const [lat, lng] = m.home_lat != null && m.home_lng != null ? [m.home_lat, m.home_lng] : [null, null];
  await q(`INSERT INTO student_profile (user_id, gpa, exam_score, budget, preferred_region, interest_field, home_province, home_lat, home_lng, subject_scores, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
           ON CONFLICT (user_id) DO UPDATE SET gpa=$2, exam_score=$3, budget=$4, preferred_region=$5, interest_field=$6, home_province=$7, home_lat=$8, home_lng=$9, subject_scores=$10, updated_at=now()`,
    [req.user!.sub, m.gpa, m.exam_score, m.budget, m.preferred_region, m.interest_field, m.home_province ?? null, lat, lng, m.subject_scores ? JSON.stringify(m.subject_scores) : null]);
  if (p.name || p.phone !== undefined) {
    await q(`UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone) WHERE user_id = $1`, [req.user!.sub, p.name ?? null, p.phone ?? null]);
  }
  res.json({ profile: await getProfile(req.user!.sub) });
}));

// ---------- FR-03 ค้นหา/กรองหลักสูตร ----------
student.get('/programs', ah(async (req, res) => {
  const { q: text, field, region, type, uni, maxFee, sort } = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (text) {
    params.push(`%${text}%`);
    const n = `$${params.length}`;
    where.push(`(p.program_name ILIKE ${n} OR u.uni_name ILIKE ${n} OR u.short_name ILIKE ${n} OR p.faculty ILIKE ${n})`);
  }
  if (field && field !== 'ทั้งหมด') add(`p.field = ?`, field);
  if (region && region !== 'ทั้งหมด') add(`u.region = ?`, region);
  if (uni && uni !== 'ทั้งหมด' && /^\d+$/.test(uni)) add(`u.uni_id = ?`, Number(uni));
  if (type && type !== 'ทั้งหมด') add(`u.type = ?`, type);
  if (maxFee) add(`p.tuition_fee <= ?`, Number(maxFee));
  const order = ({ fee: 'p.tuition_fee ASC', feeDesc: 'p.tuition_fee DESC', name: 'u.uni_name, p.program_name' } as Record<string, string>)[sort ?? ''] ?? 'p.ranking ASC';
  const rows = await q(`${PROGRAM_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}, p.program_id`, params);
  const saved = new Set((await q(`SELECT program_id FROM saved_list WHERE user_id = $1`, [req.user!.sub])).map((r) => r.program_id));
  const profile = await getProfile(req.user!.sub);
  res.json({ programs: rows.map((r) => ({ ...r, saved: saved.has(r.program_id), distanceKm: homeDistance(profile, r) })) });
}));

student.get('/programs/:id', ah(async (req, res) => {
  const id = idParam(req.params.id);
  const program = await one(`${PROGRAM_SELECT} WHERE p.program_id = $1`, [id]);
  if (!program) throw new HttpError(404, 'ไม่พบหลักสูตร');
  // คะแนน SAW ของหลักสูตรนี้ตามโปรไฟล์และน้ำหนักที่บันทึกไว้ เทียบเฉพาะหลักสูตรในกลุ่มสาขาเดียวกัน
  // (เทียบข้ามสาขาไม่มีความหมาย และจะได้คะแนนคนละสเกลกับหน้าวิเคราะห์)
  const live = await runEvaluation(req.user!.sub, { profile: { interest_field: program.field }, options: { matchField: true, sensitivity: false } });
  const evaluation = live.results.find((r) => r.program.program_id === id) ?? null;
  const saved = !!(await one(`SELECT 1 FROM saved_list WHERE user_id = $1 AND program_id = $2`, [req.user!.sub, id]));
  // มหาวิทยาลัยหนึ่งมีได้กว่าร้อยหลักสูตร: แสดงคณะเดียวกันก่อน และไม่เกิน 24 รายการ
  const others = await q(`${PROGRAM_SELECT} WHERE p.uni_id = $1 AND p.program_id <> $2 ORDER BY (p.faculty = $3) DESC, p.program_name LIMIT 24`, [program.uni_id, id, program.faculty]);
  res.json({ program, evaluation, totalPrograms: live.results.length, saved, others });
}));

// ---------- FR-04 เกณฑ์และน้ำหนัก ----------
student.get('/criteria', ah(async (req, res) => {
  const criteria = await loadCriteria();
  const weights = await getWeights(req.user!.sub);
  res.json({ criteria: criteria.map((c) => ({ ...c, weight: weights[c.criteria_id] ?? 0 })) });
}));

const weightsSchema = z.array(z.object({ criteriaId: z.number().int(), value: z.number().min(0).max(100) }));
const toMap = (arr: { criteriaId: number; value: number }[]) => Object.fromEntries(arr.map((w) => [w.criteriaId, w.value]));

student.post('/weights', ah(async (req, res) => {
  const { weights } = parse(req.body, z.object({ weights: weightsSchema }));
  const total = weights.reduce((s, w) => s + w.value, 0);
  if (Math.round(total) !== 100) throw new HttpError(400, `น้ำหนักรวมต้องเท่ากับ 100% (ตอนนี้ ${total}%)`);
  await saveWeights(req.user!.sub, toMap(weights));
  res.json({ ok: true });
}));

// ---------- FR-05 คำนวณ SAW ----------
student.post('/evaluate', ah(async (req, res) => {
  const body = parse(req.body ?? {}, z.object({
    weights: weightsSchema.optional(),
    profile: profileSchema.partial().optional(),
    options: z.object({ eligibleOnly: z.boolean(), withinBudget: z.boolean(), matchField: z.boolean(), matchRegion: z.boolean(), sensitivity: z.boolean() }).partial().optional(),
    save: z.boolean().optional(),
  }));
  if (body.save && body.weights) {
    const total = body.weights.reduce((s, w) => s + w.value, 0);
    if (Math.round(total) !== 100) throw new HttpError(400, `น้ำหนักรวมต้องเท่ากับ 100% ก่อนบันทึก (ตอนนี้ ${total}%)`);
  }
  try {
    res.json(await runEvaluation(req.user!.sub, { weights: body.weights && toMap(body.weights), profile: body.profile, options: body.options, save: body.save }));
  } catch (e) {
    if ((e as Error).message.includes('น้ำหนัก')) throw new HttpError(400, (e as Error).message);
    throw e;
  }
}));

// ---------- FR-07 ประวัติ ----------
student.get('/evaluations/history', ah(async (req, res) => {
  const runs = await q(
    `SELECT r.run_id, r.run_date, r.stability, r.weights_snapshot, r.profile_snapshot, r.options,
            (SELECT COUNT(*) FROM evaluation e WHERE e.run_id = r.run_id) AS n_programs,
            (SELECT json_agg(t ORDER BY t.rank) FROM (
               SELECT e.rank, e.total_score, p.program_name, u.short_name
               FROM evaluation e JOIN program p ON p.program_id = e.program_id JOIN university u ON u.uni_id = p.uni_id
               WHERE e.run_id = r.run_id AND e.rank <= 3) t) AS top
     FROM evaluation_run r WHERE r.user_id = $1 ORDER BY r.run_date DESC LIMIT 50`, [req.user!.sub]);
  res.json({ runs });
}));

student.get('/evaluations/:runId', ah(async (req, res) => {
  const data = await loadRun(idParam(req.params.runId), req.user!.role === 'admin' ? null : req.user!.sub);
  if (!data) throw new HttpError(404, 'ไม่พบผลการประเมิน');
  res.json(data);
}));

student.delete('/evaluations/:runId', ah(async (req, res) => {
  await q(`DELETE FROM evaluation_run WHERE run_id = $1 AND user_id = $2`, [idParam(req.params.runId), req.user!.sub]);
  res.json({ ok: true });
}));

// ---------- FR-07 รายการโปรด ----------
student.get('/saved-list', ah(async (req, res) => {
  const rows = await q(
    `SELECT s.save_id, s.saved_date, s.note, p.*, u.uni_name, u.short_name, u.region, u.type AS uni_type
     FROM saved_list s JOIN program p ON p.program_id = s.program_id JOIN university u ON u.uni_id = p.uni_id
     WHERE s.user_id = $1 ORDER BY s.saved_date DESC`, [req.user!.sub]);
  res.json({ saved: rows });
}));

student.post('/saved-list', ah(async (req, res) => {
  const b = parse(req.body, z.object({ programId: z.number().int(), note: z.string().max(255).optional() }));
  await q(`INSERT INTO saved_list (user_id, program_id, note) VALUES ($1,$2,$3)
           ON CONFLICT (user_id, program_id) DO UPDATE SET note = COALESCE(EXCLUDED.note, saved_list.note)`, [req.user!.sub, b.programId, b.note ?? null]);
  res.status(201).json({ ok: true });
}));

student.delete('/saved-list/:programId', ah(async (req, res) => {
  await q(`DELETE FROM saved_list WHERE user_id = $1 AND program_id = $2`, [req.user!.sub, idParam(req.params.programId)]);
  res.json({ ok: true });
}));

// ---------- FR-08 รายงาน (เปิดแล้วสั่งพิมพ์/บันทึกเป็น PDF ได้ทันที) ----------
student.get('/reports/:runId/export', ah(async (req, res) => {
  const data = await loadRun(idParam(req.params.runId), req.user!.role === 'admin' ? null : req.user!.sub);
  if (!data) throw new HttpError(404, 'ไม่พบผลการประเมิน');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderReport(data));
}));
