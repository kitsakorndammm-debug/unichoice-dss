import type { EvalOptions, Profile } from './types';

// สถานะล่าสุดของหน้าวิเคราะห์ (น้ำหนัก / ข้อมูล What-if / ตัวกรอง) เก็บไว้ตลอดการใช้งานในแท็บนี้
// เพื่อให้หน้าเปรียบเทียบและหน้ารายละเอียดคำนวณด้วยค่าชุดเดียวกัน คะแนนจึงตรงกันทุกหน้า
export interface EvalSession { weights: { criteriaId: number; value: number }[]; profile: Profile; options: EvalOptions; allFields: boolean }
const KEY = 'dss_eval_v2'; // v2: งบเปลี่ยนจากต่อเทอมเป็นต่อปี

export const evalSession = {
  get(): EvalSession | null { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(v: EvalSession) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem(KEY); sessionStorage.removeItem('dss_compare'); } catch { /* ignore */ } },
};
