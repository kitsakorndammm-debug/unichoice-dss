import { Router } from 'express';
import { z } from 'zod';
import { q, one, tx } from '../db.js';
import { requireAuth, requireAdmin } from '../security.js';
import { ah, parse, idParam, HttpError } from '../http.js';
import { PROGRAM_SELECT, loadCriteria } from '../service.js';
import { bumpDataVersion, cacheBackend } from '../cache.js';
import { REGIONS, FIELDS } from '../../db/data.js';
import { PROVINCES } from '../geo.js';

export const admin = Router();
admin.use(requireAuth, requireAdmin);

// ---------- FR-11 Dashboard ภาพรวม ----------
admin.get('/stats', ah(async (_req, res) => {
  const [counts] = await q(`SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
      (SELECT COUNT(*) FROM university) AS universities,
      (SELECT COUNT(*) FROM program) AS programs,
      (SELECT COUNT(*) FROM evaluation_run) AS runs,
      (SELECT COUNT(*) FROM evaluation_run WHERE run_date > now() - interval '7 days') AS runs_7d,
      (SELECT COUNT(*) FROM saved_list) AS saved,
      (SELECT ROUND(AVG(stability), 1) FROM evaluation_run) AS avg_stability`);
  const runsPerDay = await q(`
    SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(r.run_id) AS runs
    FROM generate_series(current_date - 13, current_date, interval '1 day') d
    LEFT JOIN evaluation_run r ON r.run_date::date = d::date
    GROUP BY d ORDER BY d`);
  const topRecommended = await q(`
    SELECT p.program_id, p.program_name, u.short_name, COUNT(*) AS times
    FROM evaluation e JOIN program p ON p.program_id = e.program_id JOIN university u ON u.uni_id = p.uni_id
    WHERE e.rank = 1 GROUP BY p.program_id, u.short_name ORDER BY times DESC, p.program_name LIMIT 8`);
  const avgWeights = await q(`
    SELECT w->>'name' AS name, ROUND(AVG((w->>'weight')::numeric) * 100, 1) AS weight
    FROM evaluation_run r, jsonb_array_elements(r.weights_snapshot) w
    GROUP BY w->>'name', w->>'code' ORDER BY weight DESC`);
  const regionDemand = await q(`
    SELECT COALESCE(NULLIF(preferred_region, ''), 'ทั้งหมด') AS name, COUNT(*) AS value
    FROM student_profile GROUP BY 1 ORDER BY value DESC`);
  const fieldInterest = await q(`
    SELECT COALESCE(NULLIF(interest_field, ''), 'ทั้งหมด') AS name, COUNT(*) AS value
    FROM student_profile GROUP BY 1 ORDER BY value DESC`);
  const riskMix = await q(`
    SELECT risk_level AS name, COUNT(*) AS value FROM evaluation WHERE rank <= 3 GROUP BY risk_level`);
  const recentRuns = await q(`
    SELECT r.run_id, r.run_date, u.name, r.stability,
      (SELECT p.program_name || ' (' || un.short_name || ')' FROM evaluation e JOIN program p ON p.program_id = e.program_id
       JOIN university un ON un.uni_id = p.uni_id WHERE e.run_id = r.run_id AND e.rank = 1 ORDER BY e.eval_id LIMIT 1) AS top_program
    FROM evaluation_run r JOIN users u ON u.user_id = r.user_id ORDER BY r.run_date DESC LIMIT 8`);
  res.json({ counts, runsPerDay, topRecommended, avgWeights, regionDemand, fieldInterest, riskMix, recentRuns, cacheBackend });
}));

admin.get('/users', ah(async (_req, res) => {
  res.json({ users: await q(`
    SELECT u.user_id, u.name, u.email, u.role, u.created_at, sp.gpa, sp.exam_score, sp.preferred_region, sp.interest_field,
      (SELECT COUNT(*) FROM evaluation_run r WHERE r.user_id = u.user_id) AS runs
    FROM users u LEFT JOIN student_profile sp ON sp.user_id = u.user_id ORDER BY u.role, u.user_id`) });
}));

// ---------- FR-09 จัดการมหาวิทยาลัย ----------
const uniSchema = z.object({
  uni_name: z.string().trim().min(2, 'กรุณากรอกชื่อมหาวิทยาลัย'),
  short_name: z.string().trim().max(20).nullable().optional(),
  region: z.string().refine((v) => (REGIONS as readonly string[]).includes(v), 'กรุณาเลือกภูมิภาค'),
  // จังหวัดต้องเป็นชื่อที่ระบบรู้จัก มิฉะนั้นจะคิดระยะทางสำหรับเกณฑ์ความใกล้บ้านไม่ได้
  province: z.string().refine((v) => v in PROVINCES, 'กรุณาเลือกจังหวัดจากรายการ'),
  type: z.enum(['รัฐ', 'เอกชน']),
  website: z.string().nullable().optional(),
  // พิกัดวิทยาเขต: เว้นว่าง = ใช้พิกัดตัวจังหวัดในการวัดระยะทาง
  lat: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(-90).max(90).nullable()),
  lng: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().min(-180).max(180).nullable()),
});

admin.get('/universities', ah(async (_req, res) => {
  res.json({ universities: await q(`SELECT u.*, (SELECT COUNT(*) FROM program p WHERE p.uni_id = u.uni_id) AS programs FROM university u ORDER BY u.uni_name`) });
}));
admin.post('/universities', ah(async (req, res) => {
  const b = parse(req.body, uniSchema);
  const u = await one(`INSERT INTO university (uni_name, short_name, region, province, type, website, lat, lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.uni_name, b.short_name ?? null, b.region, b.province ?? null, b.type, b.website ?? null, b.lat, b.lng]);
  await bumpDataVersion();
  res.status(201).json({ university: u });
}));
admin.put('/universities/:id', ah(async (req, res) => {
  const b = parse(req.body, uniSchema);
  const u = await one(`UPDATE university SET uni_name=$2, short_name=$3, region=$4, province=$5, type=$6, website=$7, lat=$8, lng=$9 WHERE uni_id=$1 RETURNING *`,
    [idParam(req.params.id), b.uni_name, b.short_name ?? null, b.region, b.province ?? null, b.type, b.website ?? null, b.lat, b.lng]);
  if (!u) throw new HttpError(404, 'ไม่พบมหาวิทยาลัย');
  await bumpDataVersion();
  res.json({ university: u });
}));
admin.delete('/universities/:id', ah(async (req, res) => {
  await q(`DELETE FROM university WHERE uni_id = $1`, [idParam(req.params.id)]);
  await bumpDataVersion();
  res.json({ ok: true });
}));

// ---------- FR-09 จัดการหลักสูตร ----------
const programSchema = z.object({
  uni_id: z.coerce.number().int().positive('กรุณาเลือกมหาวิทยาลัย'),
  program_name: z.string().trim().min(2, 'กรุณากรอกชื่อหลักสูตร'),
  faculty: z.string().trim().min(2, 'กรุณากรอกคณะ'),
  field: z.string().refine((v) => (FIELDS as string[]).includes(v), 'กลุ่มสาขาไม่อยู่ในรายการของระบบ'),
  degree: z.string().default('ปริญญาตรี'),
  tuition_fee: z.coerce.number().min(0, 'ค่าเทอมต้องไม่ติดลบ'),
  // ค่าเล่าเรียนต่อปี: เว้นว่าง = ค่าเทอม × 2
  yearly_cost: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().positive('ค่าเล่าเรียนต่อปีต้องมากกว่า 0').optional()),
  min_gpa: z.coerce.number().min(0).max(4, 'GPA ขั้นต่ำ 0–4'),
  min_score: z.coerce.number().min(0).max(100, 'คะแนนขั้นต่ำ 0–100'),
  capacity: z.coerce.number().int().positive('จำนวนรับต้องมากกว่า 0'),
  ranking: z.coerce.number().int().positive('อันดับต้องมากกว่า 0'),
  description: z.string().nullable().optional(),
});
const PCOLS = ['uni_id', 'program_name', 'faculty', 'field', 'degree', 'tuition_fee', 'yearly_cost', 'min_gpa', 'min_score', 'capacity', 'ranking', 'description'] as const;
const pvals = (b: z.infer<typeof programSchema>) => PCOLS.map((c) => (c === 'yearly_cost' ? b.yearly_cost ?? b.tuition_fee * 2 : (b as any)[c] ?? null));

admin.get('/programs', ah(async (_req, res) => {
  res.json({ programs: await q(`${PROGRAM_SELECT} ORDER BY u.uni_name, p.program_name`) });
}));
admin.post('/programs', ah(async (req, res) => {
  const b = parse(req.body, programSchema);
  const p = await one(`INSERT INTO program (${PCOLS.join(',')}) VALUES (${PCOLS.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, pvals(b));
  await bumpDataVersion();
  res.status(201).json({ program: p });
}));
admin.put('/programs/:id', ah(async (req, res) => {
  const b = parse(req.body, programSchema);
  const p = await one(`UPDATE program SET ${PCOLS.map((c, i) => `${c}=$${i + 2}`).join(', ')} WHERE program_id = $1 RETURNING *`, [idParam(req.params.id), ...pvals(b)]);
  if (!p) throw new HttpError(404, 'ไม่พบหลักสูตร');
  await bumpDataVersion();
  res.json({ program: p });
}));
admin.delete('/programs/:id', ah(async (req, res) => {
  await q(`DELETE FROM program WHERE program_id = $1`, [idParam(req.params.id)]);
  await bumpDataVersion();
  res.json({ ok: true });
}));

// ---------- Data Management: นำเข้า/ส่งออก CSV พร้อมตรวจสอบและเตรียมข้อมูล ----------
const CSV_HEADER = ['university', 'program_name', 'faculty', 'field', 'tuition_fee', 'min_gpa', 'min_score', 'capacity', 'ranking'];
const CSV_OPTIONAL = 'yearly_cost'; // ไม่มีคอลัมน์นี้หรือเว้นว่าง = ค่าเทอม × 2

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

admin.get('/programs/export.csv', ah(async (_req, res) => {
  const rows = await q(`${PROGRAM_SELECT} ORDER BY u.uni_name, p.program_name`);
  const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [[...CSV_HEADER, CSV_OPTIONAL].join(','), ...rows.map((r) => [r.uni_name, r.program_name, r.faculty, r.field, r.tuition_fee, r.min_gpa, r.min_score, r.capacity, r.ranking, r.yearly_cost].map(cell).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="programs.csv"');
  res.send('﻿' + csv);
}));

admin.post('/programs/import', ah(async (req, res) => {
  const { csv, dryRun } = parse(req.body, z.object({ csv: z.string().min(1, 'ไฟล์ว่าง'), dryRun: z.boolean().optional() }));
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const missing = CSV_HEADER.filter((h) => !header.includes(h));
  if (missing.length) throw new HttpError(400, `ไม่พบคอลัมน์: ${missing.join(', ')}`);
  const unis = await q(`SELECT uni_id, uni_name, short_name FROM university`);
  const findUni = (n: string) => unis.find((u) => u.uni_name === n || u.short_name === n);

  const errors: { line: number; message: string }[] = [];
  const valid: z.infer<typeof programSchema>[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const o = Object.fromEntries(header.map((h, j) => [h, (r[j] ?? '').trim()]));
    const line = i + 2;
    const uni = findUni(o.university);
    if (!uni) return errors.push({ line, message: `ไม่พบมหาวิทยาลัย "${o.university}"` });
    const key = `${uni.uni_id}|${o.program_name}`;
    if (seen.has(key)) return errors.push({ line, message: 'ข้อมูลซ้ำในไฟล์' });
    seen.add(key);
    // เตรียมข้อมูล: ตัด , ออกจากตัวเลข และตัดช่องว่าง
    const num = (v: string) => (v === '' ? NaN : Number(v.replace(/[, ]/g, '')));
    const bad = CSV_HEADER.slice(4).filter((h) => Number.isNaN(num(o[h])));
    if (o[CSV_OPTIONAL] && Number.isNaN(num(o[CSV_OPTIONAL]))) bad.push(CSV_OPTIONAL);
    if (bad.length) return errors.push({ line, message: `ต้องเป็นตัวเลข: ${bad.join(', ')}` });
    const r2 = programSchema.safeParse({ ...o, uni_id: uni.uni_id, tuition_fee: num(o.tuition_fee), yearly_cost: o[CSV_OPTIONAL] ? num(o[CSV_OPTIONAL]) : undefined, min_gpa: num(o.min_gpa), min_score: num(o.min_score),
      capacity: num(o.capacity), ranking: num(o.ranking) });
    if (!r2.success) return errors.push({ line, message: r2.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
    valid.push(r2.data);
  });

  let inserted = 0, updated = 0;
  if (!dryRun && valid.length) {
    await tx(async (c) => {
      for (const b of valid) {
        const r = await c.query(
          `INSERT INTO program (${PCOLS.join(',')}) VALUES (${PCOLS.map((_, i) => '$' + (i + 1)).join(',')})
           ON CONFLICT (uni_id, program_name) DO UPDATE SET ${PCOLS.slice(2).map((col) => `${col} = EXCLUDED.${col}`).join(', ')}
           RETURNING (xmax = 0) AS inserted`, pvals(b));
        r.rows[0].inserted ? inserted++ : updated++;
      }
    });
    await bumpDataVersion();
  }
  res.json({ total: rows.length, valid: valid.length, errors, inserted, updated, dryRun: !!dryRun });
}));

// ---------- FR-10 จัดการเกณฑ์มาตรฐานกลาง ----------
admin.get('/criteria', ah(async (_req, res) => { res.json({ criteria: await loadCriteria(false) }); }));
admin.put('/criteria/:id', ah(async (req, res) => {
  const b = parse(req.body, z.object({
    criteria_name: z.string().trim().min(2),
    type: z.enum(['benefit', 'cost']),
    description: z.string().nullable().optional(),
    default_weight: z.coerce.number().min(0).max(100),
    is_active: z.boolean(),
  }));
  const c = await one(`UPDATE criteria SET criteria_name=$2, type=$3, description=$4, default_weight=$5, is_active=$6 WHERE criteria_id=$1 RETURNING *`,
    [idParam(req.params.id), b.criteria_name, b.type, b.description ?? null, b.default_weight, b.is_active]);
  if (!c) throw new HttpError(404, 'ไม่พบเกณฑ์');
  await bumpDataVersion();
  res.json({ criteria: c });
}));
