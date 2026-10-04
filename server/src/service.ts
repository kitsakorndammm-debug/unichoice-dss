// ชั้น Data Access + Evaluation Service — เชื่อม SAW Engine กับฐานข้อมูล
import type pg from 'pg';
import { q, one, tx } from './db.js';
import { evaluate, type CriteriaDef, type EvalOptions, type EvalResult, type ProgramData, type Profile } from './saw.js';
import { cached } from './cache.js';

export const PROGRAM_SELECT = `
  SELECT p.*, u.uni_name, u.short_name, u.region, u.province, u.lat AS uni_lat, u.lng AS uni_lng, u.type AS uni_type, u.website
  FROM program p JOIN university u ON u.uni_id = p.uni_id`;

export async function loadPrograms(): Promise<ProgramData[]> {
  return q<ProgramData>(`${PROGRAM_SELECT} ORDER BY p.program_id`);
}

export async function loadCriteria(activeOnly = true): Promise<(CriteriaDef & { default_weight: number; description: string; is_active: boolean })[]> {
  return q(`SELECT * FROM criteria ${activeOnly ? 'WHERE is_active' : ''} ORDER BY sort_order, criteria_id`);
}

export const EMPTY_PROFILE: Profile = { gpa: null, exam_score: null, budget: null, preferred_region: null, interest_field: null, home_province: null, home_lat: null, home_lng: null };

export async function getProfile(userId: number): Promise<Profile> {
  const p = await one<Profile>(
    `SELECT gpa, exam_score, budget, preferred_region, interest_field, home_province, home_lat, home_lng FROM student_profile WHERE user_id = $1`, [userId]);
  return p ?? { ...EMPTY_PROFILE };
}

/** น้ำหนักของผู้ใช้ (ถ้ายังไม่เคยตั้ง ใช้ค่าเริ่มต้นของเกณฑ์) */
export async function getWeights(userId: number): Promise<Record<number, number>> {
  const criteria = await loadCriteria();
  const rows = await q<{ criteria_id: number; weight_value: number }>(`SELECT criteria_id, weight_value FROM user_weight WHERE user_id = $1`, [userId]);
  const saved = new Map(rows.map((r) => [r.criteria_id, r.weight_value]));
  const out: Record<number, number> = {};
  for (const c of criteria) out[c.criteria_id] = saved.has(c.criteria_id) ? saved.get(c.criteria_id)! : c.default_weight;
  return out;
}

export async function saveWeights(userId: number, weights: Record<number, number>, client?: pg.PoolClient) {
  const run = (t: string, p: unknown[]) => (client ? client.query(t, p) : q(t, p));
  for (const [cid, val] of Object.entries(weights)) {
    await run(
      `INSERT INTO user_weight (user_id, criteria_id, weight_value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, criteria_id) DO UPDATE SET weight_value = EXCLUDED.weight_value`,
      [userId, Number(cid), val]);
  }
}

export interface RunInput {
  weights?: Record<number, number>;
  profile?: Partial<Profile>;
  options?: EvalOptions;
  save?: boolean;
}

/** คำนวณ SAW (ใช้แคชเมื่อไม่ได้บันทึก) และบันทึกลง evaluation_run / evaluation / evaluation_detail เมื่อ save = true */
export async function runEvaluation(userId: number, input: RunInput): Promise<EvalResult & { runId?: number; cacheHit?: boolean; profile: Profile }> {
  const criteria = await loadCriteria();
  const weights = input.weights && Object.keys(input.weights).length ? input.weights : await getWeights(userId);
  const profile: Profile = { ...(await getProfile(userId)), ...(input.profile ?? {}) };
  const options: EvalOptions = { sensitivity: true, ...(input.options ?? {}) };

  const { value: result, hit } = await cached({ weights, profile, options, c: criteria.map((c) => c.criteria_id) }, 300, async () =>
    evaluate(await loadPrograms(), criteria, weights, profile, options));

  if (!input.save) return { ...result, cacheHit: hit, profile };

  const runId = await tx(async (c) => {
    const run = await c.query(
      `INSERT INTO evaluation_run (user_id, profile_snapshot, weights_snapshot, options, stability)
       VALUES ($1, $2, $3, $4, $5) RETURNING run_id`,
      [userId, JSON.stringify(profile), JSON.stringify(result.weights), JSON.stringify(options), result.sensitivity?.stability ?? null]);
    const id = run.rows[0].run_id as number;
    for (const r of result.results) {
      const e = await c.query(
        `INSERT INTO evaluation (run_id, user_id, program_id, total_score, rank, admission_chance, risk_level, flags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING eval_id`,
        [id, userId, r.program.program_id, r.score, r.rank, r.admissionChance, r.risk, JSON.stringify(r.flags)]);
      const evalId = e.rows[0].eval_id;
      for (const d of r.details) {
        await c.query(
          `INSERT INTO evaluation_detail (eval_id, criteria_id, raw_value, normalized_score, weighted_score) VALUES ($1, $2, $3, $4, $5)`,
          [evalId, d.criteria_id, d.raw, d.normalized, d.weighted]);
      }
    }
    await saveWeights(userId, Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Number(v)])), c);
    return id;
  });
  return { ...result, runId, cacheHit: hit, profile };
}

/** อ่านผลการประเมินที่บันทึกไว้กลับมาจากฐานข้อมูล */
export async function loadRun(runId: number, userId: number | null) {
  const run = await one(`SELECT r.*, u.name AS user_name FROM evaluation_run r JOIN users u ON u.user_id = r.user_id
                         WHERE r.run_id = $1 ${userId != null ? 'AND r.user_id = $2' : ''}`, userId != null ? [runId, userId] : [runId]);
  if (!run) return null;
  const evals = await q(
    `SELECT e.*, p.program_name, p.faculty, p.field, p.tuition_fee, p.yearly_cost, p.ranking AS program_rank,
            u.uni_name, u.short_name, u.region
     FROM evaluation e JOIN program p ON p.program_id = e.program_id JOIN university u ON u.uni_id = p.uni_id
     WHERE e.run_id = $1 ORDER BY e.rank`, [runId]);
  const details = await q(
    `SELECT d.*, c.criteria_name, c.code, c.type FROM evaluation_detail d
     JOIN evaluation e ON e.eval_id = d.eval_id JOIN criteria c ON c.criteria_id = d.criteria_id
     WHERE e.run_id = $1 ORDER BY c.sort_order`, [runId]);
  const byEval = new Map<number, any[]>();
  for (const d of details) (byEval.get(d.eval_id) ?? byEval.set(d.eval_id, []).get(d.eval_id)!).push(d);
  return { run, results: evals.map((e) => ({ ...e, details: byEval.get(e.eval_id) ?? [] })) };
}
