/**
 * วิชาสอบ TCAS ที่ผู้ใช้กรอกคะแนนแยกได้ (เต็ม 100 ทุกวิชา) — รหัสตรงกับ score_weights ของหลักสูตร
 * (แปลงมาจากรหัสของ mytcas ใน db/tools/fetch-criteria.cjs) ส่วน GPAX ใช้ค่า GPA ของผู้ใช้ ไม่ต้องกรอกซ้ำ
 */
export const SUBJECTS = [
  { key: 'tgat', label: 'TGAT', hint: 'ความถนัดทั่วไป', group: 'TGAT / TPAT' },
  { key: 'tpat1', label: 'TPAT1', hint: 'กสพท (แพทย์)', group: 'TGAT / TPAT' },
  { key: 'tpat2', label: 'TPAT2', hint: 'ศิลปกรรม', group: 'TGAT / TPAT' },
  { key: 'tpat3', label: 'TPAT3', hint: 'วิทย์ เทคโนโลยี วิศวะ', group: 'TGAT / TPAT' },
  { key: 'tpat4', label: 'TPAT4', hint: 'สถาปัตย์', group: 'TGAT / TPAT' },
  { key: 'tpat5', label: 'TPAT5', hint: 'ครุศาสตร์', group: 'TGAT / TPAT' },
  { key: 'a61', label: 'คณิต 1', hint: 'A-Level', group: 'A-Level' },
  { key: 'a62', label: 'คณิต 2', hint: 'A-Level', group: 'A-Level' },
  { key: 'a63', label: 'วิทย์ประยุกต์', hint: 'A-Level', group: 'A-Level' },
  { key: 'a64', label: 'ฟิสิกส์', hint: 'A-Level', group: 'A-Level' },
  { key: 'a65', label: 'เคมี', hint: 'A-Level', group: 'A-Level' },
  { key: 'a66', label: 'ชีววิทยา', hint: 'A-Level', group: 'A-Level' },
  { key: 'a70', label: 'สังคมศึกษา', hint: 'A-Level', group: 'A-Level' },
  { key: 'a81', label: 'ภาษาไทย', hint: 'A-Level', group: 'A-Level' },
  { key: 'a82', label: 'ภาษาอังกฤษ', hint: 'A-Level', group: 'A-Level' },
  { key: 'alang', label: 'ภาษาที่สาม', hint: 'A-Level จีน ญี่ปุ่น ฯลฯ', group: 'A-Level' },
] as const;
export type SubjectKey = (typeof SUBJECTS)[number]['key'];
export const SUBJECT_KEYS = SUBJECTS.map((s) => s.key) as [SubjectKey, ...SubjectKey[]];
/** รหัสใน score_weights ของหลักสูตร = วิชาข้างต้น + gpax */
export type ScoreWeights = Partial<Record<SubjectKey | 'gpax', number>>;
export type SubjectScores = Partial<Record<SubjectKey, number>>;
