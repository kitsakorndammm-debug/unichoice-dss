export type Role = 'student' | 'admin';
export interface User { user_id: number; name: string; email: string; role: Role; phone?: string | null }
export interface Profile { gpa: number | null; exam_score: number | null; budget: number | null; preferred_region: string | null; interest_field: string | null; home_province?: string | null; home_lat?: number | null; home_lng?: number | null }
export interface Criteria { criteria_id: number; code: string; criteria_name: string; type: 'benefit' | 'cost'; description: string; default_weight: number; is_active: boolean; weight?: number; sort_order?: number }
export interface Program {
  program_id: number; uni_id: number; program_name: string; faculty: string; field: string; degree: string;
  gpax_weight?: number | null; // สัดส่วน GPAX (0–1) ในคะแนนรวมที่หลักสูตรใช้คัดเลือกรอบ 3
  max_score?: number | null; applicants?: number | null; score_source?: string | null; // มีค่า = เกณฑ์รับเป็นสถิติจริงของ ทปอ.
  tuition_fee: number; yearly_cost: number; min_gpa: number; min_score: number; capacity: number; ranking: number;
  description?: string | null; uni_name: string; short_name: string | null; region: string; province?: string; uni_lat?: number | null; uni_lng?: number | null; uni_type?: string; website?: string; saved?: boolean; distanceKm?: number | null;
}
export type Flag = 'below_min_gpa' | 'below_min_score' | 'over_budget' | 'region_mismatch' | 'field_mismatch';
export interface CriterionScore { criteria_id: number; code: string; name: string; type: 'benefit' | 'cost'; raw: number; normalized: number; weight: number; weighted: number }
export interface Ranked { rank: number; program: Program; score: number; admissionChance: number; distanceKm?: number | null; risk: 'low' | 'medium' | 'high'; flags: Flag[]; details: CriterionScore[]; strengths: string[]; weaknesses: string[] }
export interface Scenario { criteria_id: number; name: string; delta: number; topProgramId: number; topProgramName: string; changed: boolean }
export interface EvalResult {
  results: Ranked[]; excluded: { program: Program; flags: Flag[] }[];
  weights: { criteria_id: number; code: string; name: string; weight: number }[];
  sensitivity: { stability: number; scenarios: Scenario[] } | null;
  summary: { total: number; candidates: number; excluded: number; topGap: number | null; avgScore: number | null };
  runId?: number; cacheHit?: boolean; profile: Profile;
}
export interface EvalOptions { eligibleOnly?: boolean; withinBudget?: boolean; matchField?: boolean; matchRegion?: boolean }
export interface Meta { regions: string[]; fields: string[]; provinces: string[]; provinceCoords: Record<string, [number, number]>; universities: { uni_id: number; uni_name: string; short_name: string; region: string; type: string }[] }
