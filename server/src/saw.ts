/**
 * SAW Decision Engine (Simple Additive Weighting)
 * ------------------------------------------------
 * ส่วน "Model & Analytics" ของ DSS ประกอบด้วย
 *   1) Business Rules  : คัดกรองหลักสูตร (เกรดขั้นต่ำ / คะแนนขั้นต่ำ / งบประมาณ / สาขา / ภูมิภาค)
 *   2) Risk Model      : ประเมินโอกาสสอบติดและระดับความเสี่ยงจากส่วนต่าง GPA/คะแนนกับเกณฑ์ขั้นต่ำ
 *   3) SAW             : Normalize (benefit = x/max, cost = min/x, อันดับ = เส้นตรง) → คูณน้ำหนัก → รวม → จัดอันดับ
 *   4) Sensitivity     : ปรับน้ำหนักทีละเกณฑ์ ±10/±20% เพื่อตรวจว่าอันดับ 1 เปลี่ยนหรือไม่ (ความเสถียรของคำแนะนำ)
 * โมดูลนี้เป็น pure function ไม่แตะฐานข้อมูล จึงทดสอบแยกได้ (ดู src/saw.test.ts)
 */

import { distanceBetween, proximityScore } from './geo.js';

export type CriteriaType = 'benefit' | 'cost';

export interface CriteriaDef {
  criteria_id: number;
  code: string;
  criteria_name: string;
  type: CriteriaType;
}

export interface ProgramData {
  program_id: number;
  program_name: string;
  uni_name: string;
  short_name?: string | null;
  region: string;
  province?: string | null;
  uni_lat?: number | null;      // พิกัดวิทยาเขตหลัก (ไม่มี = ใช้พิกัดตัวจังหวัด)
  uni_lng?: number | null;
  field: string;
  tuition_fee: number;          // ค่าเทอมต่อ 1 เทอม (ใช้แสดงผล)
  yearly_cost?: number | null;  // ค่าเล่าเรียนเฉลี่ยต่อปี (ใช้คำนวณและเทียบงบ) ไม่ระบุ = ค่าเทอม × 2
  min_gpa: number;              // 0 = ไม่กำหนด
  min_score: number;            // คะแนนต่ำสุดของผู้ที่สอบติด (หรือค่าประมาณ)
  max_score?: number | null;    // คะแนนสูงสุดของผู้ที่สอบติด — มีค่า = เป็นสถิติจริง
  gpax_weight?: number | null;  // สัดส่วน GPAX (0–1) ในคะแนนรวมที่หลักสูตรใช้คัดเลือก — ใช้กับสถิติจริงเท่านั้น
  ranking: number;
  capacity: number;
}

export interface Profile {
  gpa: number | null;
  exam_score: number | null;
  budget: number | null;
  preferred_region: string | null;
  interest_field: string | null;
  home_province?: string | null; // จังหวัดที่อยู่ ใช้คิดระยะทางถึงมหาวิทยาลัย
  home_lat?: number | null;      // ตำแหน่งจริงจากการระบุตำแหน่งของเบราว์เซอร์ (มี = ใช้แทนจังหวัด)
  home_lng?: number | null;
}

/** ระยะทางเส้นตรง (กม.) จากที่อยู่ของผู้ใช้ถึงมหาวิทยาลัยของหลักสูตร — null ถ้ายังไม่ระบุที่อยู่ */
export const homeDistance = (profile: Profile, p: ProgramData) =>
  distanceBetween({ lat: profile.home_lat, lng: profile.home_lng, province: profile.home_province }, { lat: p.uni_lat, lng: p.uni_lng, province: p.province });

export interface EvalOptions {
  eligibleOnly?: boolean;   // ตัดหลักสูตรที่ GPA/คะแนนไม่ถึงขั้นต่ำออก
  withinBudget?: boolean;   // ตัดหลักสูตรที่ค่าเล่าเรียนต่อปีเกินงบออก
  matchField?: boolean;     // แสดงเฉพาะสาขาที่สนใจ
  matchRegion?: boolean;    // แสดงเฉพาะภูมิภาคที่สนใจ
  sensitivity?: boolean;    // คำนวณการวิเคราะห์ความไว
}

export type Flag = 'below_min_gpa' | 'below_min_score' | 'over_budget' | 'region_mismatch' | 'field_mismatch';

export interface CriterionScore {
  criteria_id: number;
  code: string;
  name: string;
  type: CriteriaType;
  raw: number;
  normalized: number; // 0–1
  weight: number;     // 0–1
  weighted: number;   // normalized × weight
}

export interface RankedProgram {
  rank: number;
  program: ProgramData;
  score: number;            // 0–100
  admissionChance: number;  // 0–100
  distanceKm: number | null; // ระยะทางเส้นตรงจากจังหวัดที่อยู่ (null = ยังไม่ระบุจังหวัด)
  risk: 'low' | 'medium' | 'high';
  flags: Flag[];
  details: CriterionScore[];
  strengths: string[];
  weaknesses: string[];
}

export interface ExcludedProgram {
  program: ProgramData;
  flags: Flag[];
}

export interface SensitivityScenario {
  criteria_id: number;
  name: string;
  delta: number;            // จุดเปอร์เซ็นต์ที่ปรับ
  topProgramId: number;
  topProgramName: string;
  changed: boolean;
}

export interface EvalResult {
  results: RankedProgram[];
  excluded: ExcludedProgram[];
  weights: { criteria_id: number; code: string; name: string; weight: number }[];
  sensitivity: { stability: number; scenarios: SensitivityScenario[] } | null;
  summary: {
    total: number;
    candidates: number;
    excluded: number;
    topGap: number | null;  // ห่างจากอันดับ 2 กี่คะแนน
    avgScore: number | null;
  };
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * คะแนนของผู้ใช้ที่เทียบกับสถิติคะแนนต่ำสุด–สูงสุดของหลักสูตรได้ (เต็ม 100) — null ถ้ายังไม่กรอกทั้ง GPA และคะแนนสอบ
 * สถิติของ ทปอ. เป็นคะแนนรวมตามเกณฑ์ของแต่ละหลักสูตร บางหลักสูตรใช้ GPAX เป็นส่วนหนึ่งหรือทั้งหมด
 * จึงผสม GPAX (คิดเป็นร้อยละ = GPA ÷ 4 × 100) กับคะแนนสอบตามสัดส่วน gpax_weight ของหลักสูตรนั้น
 */
export function comparableScore(profile: Profile, p: ProgramData): number | null {
  const w = p.max_score != null ? clamp(Number(p.gpax_weight ?? 0), 0, 1) : 0;
  const gpaPct = profile.gpa != null ? profile.gpa * 25 : null;
  const exam = profile.exam_score ?? null;
  if (w === 0) return exam;
  if (gpaPct == null && exam == null) return null;
  return round(w * (gpaPct ?? exam!) + (1 - w) * (exam ?? gpaPct!), 2);
}

/** แบบจำลองโอกาสสอบติด: เทียบ GPA และคะแนนสอบกับเกณฑ์ขั้นต่ำของหลักสูตร */
export function admissionChance(profile: Profile, p: ProgramData): number {
  const score = profile.exam_score ?? p.min_score;
  // มีสถิติจริง: ดูว่าคะแนนของผู้ใช้อยู่ตรงไหนระหว่างคะแนนต่ำสุดกับสูงสุดของผู้ที่สอบติดปีก่อน
  //   เท่ากับคะแนนต่ำสุด = 50% (คนสุดท้ายที่ติด), ถึงคะแนนสูงสุด = 95%, ต่ำกว่าต่ำสุดเท่าช่วงนั้น = 5%
  if (p.max_score != null) {
    const mine = comparableScore(profile, p) ?? p.min_score;
    const span = Math.max(5, p.max_score - p.min_score);
    return Math.round(clamp(50 + 45 * clamp((mine - p.min_score) / span, -1, 1), 5, 95));
  }
  // ไม่มีสถิติจริง: ประมาณจากส่วนต่าง GPA และคะแนนกับเกณฑ์ขั้นต่ำโดยประมาณ
  const gpa = profile.gpa ?? p.min_gpa;
  // ส่วนต่าง GPA 0.5 ขึ้นไป = เต็ม, ส่วนต่างคะแนน 15% ขึ้นไป = เต็ม
  const g = clamp((gpa - p.min_gpa) / 0.5, -1, 1);
  const s = clamp((score - p.min_score) / 15, -1, 1);
  const x = 0.4 * g + 0.6 * s; // คะแนนสอบมีผลมากกว่า GPA ในระบบ TCAS
  return Math.round(clamp(50 + 45 * x, 5, 95));
}

export function riskLevel(chance: number): 'low' | 'medium' | 'high' {
  if (chance >= 70) return 'low';
  if (chance >= 45) return 'medium';
  return 'high';
}

const noPref = (v: string | null | undefined) => !v || v === 'ทั้งหมด';

/** ค่าเล่าเรียนต่อปี — เทียบเป็นรายปีเพื่อให้มหาวิทยาลัยที่มี 2 และ 3 เทอมต่อปีเทียบกันได้ */
export const yearlyCost = (p: ProgramData) => p.yearly_cost ?? p.tuition_fee * 2;

/** ค่าดิบของแต่ละเกณฑ์ (ผูกด้วย criteria.code) */
export function rawValue(code: string, p: ProgramData, profile: Profile): number {
  switch (code) {
    case 'tuition': return yearlyCost(p);
    case 'ranking': return p.ranking;
    case 'admission': return admissionChance(profile, p);
    case 'location': {
      // รู้จังหวัดที่อยู่ → คิดจากระยะทางจริง, ไม่รู้ → ใช้ภูมิภาคที่สนใจแทน (ตรง = 100, ไม่ตรง = 50)
      const km = homeDistance(profile, p);
      if (km != null) return proximityScore(km);
      return noPref(profile.preferred_region) || profile.preferred_region === p.region ? 100 : 50;
    }
    case 'capacity': return p.capacity;
    default: throw new Error(`Unknown criteria code: ${code}`);
  }
}

export function flagsFor(p: ProgramData, profile: Profile): Flag[] {
  const f: Flag[] = [];
  if (profile.gpa != null && profile.gpa < p.min_gpa) f.push('below_min_gpa');
  const mine = comparableScore(profile, p);
  if (mine != null && mine < p.min_score) f.push('below_min_score');
  if (profile.budget != null && profile.budget > 0 && yearlyCost(p) > profile.budget) f.push('over_budget');
  if (!noPref(profile.preferred_region) && profile.preferred_region !== p.region) f.push('region_mismatch');
  if (!noPref(profile.interest_field) && profile.interest_field !== p.field) f.push('field_mismatch');
  return f;
}

/** ทำให้น้ำหนักรวมเป็น 1 */
export function normalizeWeights(raw: Record<number, number>, criteria: CriteriaDef[]): Map<number, number> {
  const total = criteria.reduce((s, c) => s + Math.max(0, raw[c.criteria_id] ?? 0), 0);
  if (total <= 0) throw new Error('น้ำหนักรวมต้องมากกว่า 0');
  return new Map(criteria.map((c) => [c.criteria_id, Math.max(0, raw[c.criteria_id] ?? 0) / total]));
}

const PERCENT_CODES = new Set(['admission', 'location']);

/**
 * Normalization ตามรายงาน: benefit = x / max, cost = min / x
 * ยกเว้นเกณฑ์ที่เป็นร้อยละ (โอกาสสอบติด, พื้นที่) ใช้ x / 100
 * ยกเว้นเกณฑ์อันดับ (ranking) ซึ่งเป็นข้อมูลเชิงลำดับ ใช้แบบเส้นตรง (max − x) / (max − min)
 * เพราะ min / x ทำให้อันดับ 2 ได้คะแนนเพียงครึ่งเดียวของอันดับ 1 ซึ่งลงโทษแรงเกินจริง
 */
function normalizeMatrix(raw: number[][], criteria: CriteriaDef[]): number[][] {
  const cols = criteria.map((_, j) => raw.map((r) => r[j]));
  const max = cols.map((c) => Math.max(...c));
  const min = cols.map((c) => Math.min(...c));
  return raw.map((row) =>
    row.map((x, j) => {
      // เกณฑ์ที่เป็นร้อยละอยู่แล้ว (0–100) เทียบกับ 100 ตรง ๆ ไม่เทียบกับค่าสูงสุดในกลุ่ม
      // มิฉะนั้นถ้าทุกตัวเลือกมีโอกาสสอบติด 5% เท่ากัน ทุกตัวจะได้คะแนนเต็ม
      if (PERCENT_CODES.has(criteria[j].code)) return x / 100;
      if (criteria[j].type === 'benefit') return max[j] > 0 ? x / max[j] : 1;
      if (criteria[j].code === 'ranking') return max[j] > min[j] ? (max[j] - x) / (max[j] - min[j]) : 1;
      return x > 0 ? min[j] / x : 1;
    }),
  );
}

function scoreAll(norm: number[][], w: number[]): number[] {
  return norm.map((row) => row.reduce((s, r, j) => s + r * w[j], 0));
}

export function evaluate(
  programs: ProgramData[],
  criteria: CriteriaDef[],
  rawWeights: Record<number, number>,
  profile: Profile,
  options: EvalOptions = {},
): EvalResult {
  if (criteria.length === 0) throw new Error('ไม่มีเกณฑ์ที่เปิดใช้งาน');
  const wMap = normalizeWeights(rawWeights, criteria);
  const w = criteria.map((c) => wMap.get(c.criteria_id)!);

  // ---------- 1) Business rules: คัดกรอง ----------
  const candidates: { p: ProgramData; flags: Flag[] }[] = [];
  const excluded: ExcludedProgram[] = [];
  for (const p of programs) {
    const flags = flagsFor(p, profile);
    const out =
      (options.eligibleOnly && (flags.includes('below_min_gpa') || flags.includes('below_min_score'))) ||
      (options.withinBudget && flags.includes('over_budget')) ||
      (options.matchField && flags.includes('field_mismatch')) ||
      (options.matchRegion && flags.includes('region_mismatch'));
    (out ? excluded.push({ program: p, flags }) : candidates.push({ p, flags }));
  }

  const weightsOut = criteria.map((c, j) => ({ criteria_id: c.criteria_id, code: c.code, name: c.criteria_name, weight: round(w[j]) }));
  if (candidates.length === 0) {
    return {
      results: [], excluded, weights: weightsOut, sensitivity: null,
      summary: { total: programs.length, candidates: 0, excluded: excluded.length, topGap: null, avgScore: null },
    };
  }

  // ---------- 2) SAW ----------
  const raw = candidates.map(({ p }) => criteria.map((c) => rawValue(c.code, p, profile)));
  const norm = normalizeMatrix(raw, criteria);
  const scores = scoreAll(norm, w);

  const ranked: RankedProgram[] = candidates.map(({ p, flags }, i) => {
    const details: CriterionScore[] = criteria.map((c, j) => ({
      criteria_id: c.criteria_id, code: c.code, name: c.criteria_name, type: c.type,
      raw: raw[i][j], normalized: round(norm[i][j]), weight: round(w[j]), weighted: round(norm[i][j] * w[j]),
    }));
    const chance = admissionChance(profile, p);
    const meaningful = details.filter((d) => d.weight > 0);
    return {
      rank: 0, program: p, score: round(scores[i] * 100, 2), admissionChance: chance, distanceKm: homeDistance(profile, p), risk: riskLevel(chance), flags, details,
      strengths: meaningful.filter((d) => d.normalized >= 0.9).sort((a, b) => b.weighted - a.weighted).slice(0, 3).map((d) => d.name),
      weaknesses: meaningful.filter((d) => d.normalized < 0.7).sort((a, b) => a.normalized - b.normalized).slice(0, 2).map((d) => d.name),
    };
  });
  ranked.sort((a, b) => b.score - a.score || b.admissionChance - a.admissionChance || a.program.program_id - b.program.program_id);
  // คะแนนและโอกาสสอบติดเท่ากัน = อันดับร่วม (1, 1, 3, ...) ไม่ทำให้ดูเหมือนตัวหนึ่งดีกว่า
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    r.rank = prev && prev.score === r.score && prev.admissionChance === r.admissionChance ? prev.rank : i + 1;
  });

  // ---------- 3) Sensitivity analysis ----------
  let sensitivity: EvalResult['sensitivity'] = null;
  if (options.sensitivity !== false && candidates.length > 1) {
    const topId = ranked[0].program.program_id;
    const scenarios: SensitivityScenario[] = [];
    criteria.forEach((c, j) => {
      for (const delta of [-20, -10, 10, 20]) {
        const target = clamp(w[j] + delta / 100, 0, 1);
        if (Math.abs(target - w[j]) < 1e-9) continue;
        const rest = 1 - w[j];
        const w2 = w.map((wk, k) => (k === j ? target : rest > 0 ? (wk * (1 - target)) / rest : (1 - target) / (w.length - 1)));
        const s2 = scoreAll(norm, w2);
        let best = 0;
        s2.forEach((s, i) => { if (s > s2[best] + 1e-12) best = i; });
        const p = candidates[best].p;
        scenarios.push({ criteria_id: c.criteria_id, name: c.criteria_name, delta, topProgramId: p.program_id, topProgramName: `${p.short_name || p.uni_name} · ${p.program_name.replace(/^(วท|วศ)\.บ\.\s*/, '')}`, changed: p.program_id !== topId });
      }
    });
    const stable = scenarios.filter((s) => !s.changed).length;
    sensitivity = { stability: scenarios.length ? round((stable / scenarios.length) * 100, 2) : 100, scenarios };
  }

  return {
    results: ranked,
    excluded,
    weights: weightsOut,
    sensitivity,
    summary: {
      total: programs.length,
      candidates: candidates.length,
      excluded: excluded.length,
      topGap: ranked.length > 1 ? round(ranked[0].score - ranked[1].score, 2) : null,
      avgScore: round(ranked.reduce((s, r) => s + r.score, 0) / ranked.length, 2),
    },
  };
}
