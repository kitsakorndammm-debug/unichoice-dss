// สร้างตาราง + ใส่ข้อมูลตั้งต้น   ใช้: npm run db:reset
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, q, one } from './db.js';
import { hashPassword } from './security.js';
import { runEvaluation } from './service.js';
import { criteria, universities, programs, demoStudents } from '../db/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = [path.join(here, '../db/schema.sql'), path.join(here, '../../db/schema.sql')].find((p) => fs.existsSync(p))!;

export async function resetDatabase(log = console.log) {
  await pool.query(fs.readFileSync(schemaPath, 'utf8'));
  log('✔ สร้างตาราง 10 ตาราง');

  for (const [i, c] of criteria.entries()) {
    await q(`INSERT INTO criteria (code, criteria_name, type, description, default_weight, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
      [c.code, c.name, c.type, c.desc, c.weight, i + 1]);
  }
  const uniId = new Map<string, number>();
  for (const u of universities) {
    const r = await one<{ uni_id: number }>(
      `INSERT INTO university (uni_name, short_name, region, province, type, website, lat, lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING uni_id`,
      [u.name, u.short, u.region, u.province, u.type, u.web, u.lat, u.lng]);
    uniId.set(u.short, r!.uni_id);
  }
  for (const p of programs) {
    await q(`INSERT INTO program (uni_id, program_name, faculty, field, tuition_fee, yearly_cost, min_gpa, min_score, capacity, ranking, description, max_score, applicants, score_source, gpax_weight, score_weights)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [uniId.get(p.uni), p.name, p.faculty, p.field, p.fee, p.yearly, p.minGpa, p.minScore, Math.max(1, p.cap), p.rank, p.desc, p.maxScore, p.applicants, p.scoreSource, p.gpaxWeight, p.scoreWeights ? JSON.stringify(p.scoreWeights) : null]);
  }
  log(`✔ เกณฑ์ ${criteria.length} | มหาวิทยาลัย ${universities.length} | หลักสูตร ${programs.length}`);

  await q(`INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'admin')`, ['ผู้ดูแลระบบ', 'admin@dss.local', hashPassword('admin1234')]);
  const crit = await q<{ criteria_id: number; code: string; default_weight: number }>(`SELECT criteria_id, code, default_weight FROM criteria ORDER BY sort_order`);

  // ประวัติการใช้งานจำลองย้อนหลัง 14 วัน ให้ Dashboard ผู้ดูแลมีข้อมูลแสดง
  let seedN = 7;
  const rand = () => ((seedN = (seedN * 9301 + 49297) % 233280) / 233280);
  for (const [i, s] of demoStudents.entries()) {
    const u = await one<{ user_id: number }>(`INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'student') RETURNING user_id`,
      [s.name, s.email, hashPassword('student1234')]);
    await q(`INSERT INTO student_profile (user_id, gpa, exam_score, budget, preferred_region, interest_field, home_province) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [u!.user_id, s.gpa, s.exam, s.budget, s.region, s.field, s.home]);
    if (i === 0) continue; // บัญชีเดโมหลักเริ่มแบบว่าง ให้ทดลองเองตอนนำเสนอ
    const runs = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < runs; k++) {
      const raw = crit.map((c) => Math.max(0, c.default_weight + Math.round((rand() - 0.5) * 30)));
      const total = raw.reduce((a, b) => a + b, 0) || 1;
      const weights = Object.fromEntries(crit.map((c, j) => [c.criteria_id, Math.round((raw[j] / total) * 100)]));
      // ใช้ตัวกรองเดียวกับค่าเริ่มต้นของหน้าวิเคราะห์: เฉพาะสาขาที่สนใจ และไม่เกินงบ
      const res = await runEvaluation(u!.user_id, { weights, save: true, options: { matchField: true, withinBudget: true } });
      const daysAgo = Math.floor(rand() * 14);
      await q(`UPDATE evaluation_run SET run_date = now() - ($2 || ' days')::interval - ($3 || ' minutes')::interval WHERE run_id = $1`,
        [res.runId, daysAgo, Math.floor(rand() * 600)]);
      await q(`UPDATE evaluation e SET eval_date = r.run_date FROM evaluation_run r WHERE r.run_id = e.run_id AND r.run_id = $1`, [res.runId]);
    }
    const top = await q<{ program_id: number }>(`SELECT program_id FROM evaluation WHERE user_id = $1 AND rank <= 2 LIMIT 2`, [u!.user_id]);
    for (const t of top) await q(`INSERT INTO saved_list (user_id, program_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u!.user_id, t.program_id]);
  }
  const n = await one<{ n: number }>(`SELECT COUNT(*) AS n FROM evaluation_run`);
  log(`✔ ผู้ใช้: admin@dss.local / admin1234 , student@dss.local / student1234 (+ นักเรียนจำลอง ${demoStudents.length - 1} คน, ประวัติ ${n!.n} รอบ)`);
}

export async function ensureDatabase() {
  const exists = await one<{ t: string | null }>(`SELECT to_regclass('public.criteria') AS t`);
  if (!exists?.t) {
    console.log('[db] ยังไม่มีตาราง — สร้างและใส่ข้อมูลตั้งต้นอัตโนมัติ');
    await resetDatabase();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  resetDatabase().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
