import type { Flag } from './types';

export const baht = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 }));
export const pct = (n: number | null | undefined, d = 0) => (n == null ? '-' : `${Number(n).toFixed(d)}%`);
export const fmtDate = (s: string) => new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const uniLabel = (p: { short_name?: string | null; uni_name: string }) => p.short_name || p.uni_name;

/** ลิงก์เส้นทางใน Google Maps ไปยังมหาวิทยาลัย (มีตำแหน่งจริงของผู้ใช้ = ใส่เป็นจุดเริ่มต้นให้ ไม่มี = Google ใช้ตำแหน่งปัจจุบันเอง) */
export function mapUrl(p: { uni_name: string; uni_lat?: number | null; uni_lng?: number | null }, home?: { home_lat?: number | null; home_lng?: number | null; home_province?: string | null } | null) {
  const dest = p.uni_lat != null && p.uni_lng != null ? `${p.uni_lat},${p.uni_lng}` : p.uni_name;
  const origin = home?.home_lat != null && home?.home_lng != null ? `${home.home_lat},${home.home_lng}` : home?.home_province ?? '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;
}

export const FLAG_TEXT: Record<Flag, string> = {
  below_min_gpa: 'GPA ต่ำกว่าเกณฑ์',
  below_min_score: 'คะแนนต่ำกว่าเกณฑ์',
  over_budget: 'เกินงบ',
  region_mismatch: 'นอกภูมิภาคที่สนใจ',
  field_mismatch: 'ไม่ตรงสาขาที่สนใจ',
};

export const RISK = {
  low: { text: 'เสี่ยงต่ำ', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', dot: '#0ca30c', icon: '●' },
  medium: { text: 'เสี่ยงปานกลาง', cls: 'bg-amber-50 text-amber-800 ring-amber-600/20', dot: '#fab219', icon: '▲' },
  high: { text: 'เสี่ยงสูง', cls: 'bg-red-50 text-red-800 ring-red-600/20', dot: '#d03b3b', icon: '■' },
} as const;

// ชุดสีเชิงหมวดหมู่ (ตรวจ CVD แล้ว) — สีผูกกับ "เกณฑ์" ตามลำดับ sort_order เสมอ ไม่เปลี่ยนตามอันดับ
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CODE_ORDER = ['tuition', 'employment', 'admission', 'ranking', 'salary', 'location'];
export const colorFor = (code: string) => { const i = CODE_ORDER.indexOf(code); return SERIES[i < 0 ? 6 : i]; };

/** ชื่อวิชาในสูตรคะแนนคัดเลือก (รหัสตรงกับ server/src/subjects.ts) */
export const SUBJECT_LABEL: Record<string, string> = {
  gpax: 'GPAX', tgat: 'TGAT', tpat1: 'TPAT1', tpat2: 'TPAT2', tpat3: 'TPAT3', tpat4: 'TPAT4', tpat5: 'TPAT5',
  a61: 'คณิต 1', a62: 'คณิต 2', a63: 'วิทย์ประยุกต์', a64: 'ฟิสิกส์', a65: 'เคมี', a66: 'ชีววิทยา', a70: 'สังคมศึกษา', a81: 'ภาษาไทย', a82: 'ภาษาอังกฤษ', alang: 'ภาษาที่สาม',
};
/** สูตรคะแนนเป็นข้อความ เช่น "TGAT 20% · คณิต 1 40% · ภาษาอังกฤษ 40%" (เรียงจากน้ำหนักมากไปน้อย) */
export const formulaText = (w: Record<string, number>) =>
  Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SUBJECT_LABEL[k] ?? k} ${Number(v) % 1 ? Number(v).toFixed(1) : v}%`).join(' · ');
