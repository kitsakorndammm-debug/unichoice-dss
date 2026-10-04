// ตรวจคุณภาพคำแนะนำด้วยผู้ใช้จำลอง (ไม่ต้องใช้ฐานข้อมูล): npx tsx src/persona.check.ts
import { evaluate, type CriteriaDef, type ProgramData, type Profile } from './saw.js';
import { criteria as C, universities, programs, FIELDS } from '../db/data.js';

const crit: CriteriaDef[] = C.map((c, i) => ({ criteria_id: i + 1, code: c.code, criteria_name: c.name, type: c.type }));
const uni = new Map(universities.map((u) => [u.short as string, u]));
const progs: ProgramData[] = programs.map((p, i) => ({
  program_id: i + 1, program_name: p.name, uni_name: uni.get(p.uni)!.name, short_name: p.uni, region: uni.get(p.uni)!.region, province: uni.get(p.uni)!.province, uni_lat: uni.get(p.uni)!.lat, uni_lng: uni.get(p.uni)!.lng,
  field: p.field, tuition_fee: p.fee, yearly_cost: p.yearly, min_gpa: p.minGpa, gpax_weight: p.gpaxWeight, min_score: p.minScore, max_score: p.maxScore, ranking: p.rank, capacity: p.cap,
}));
const W = (w: Record<string, number>) => Object.fromEntries(crit.map((c) => [c.criteria_id, w[c.code] ?? 0]));
const DEF = W(Object.fromEntries(C.map((c) => [c.code, c.weight])));
const PRESETS: Record<string, Record<string, number>> = {
  'ประหยัด': { tuition: 55, admission: 20, location: 15, ranking: 10 },
  'ชื่อเสียง': { ranking: 55, admission: 20, tuition: 15, location: 10 },
  'สอบติด': { admission: 55, tuition: 20, location: 15, ranking: 10 },
  'ใกล้บ้าน': { location: 50, tuition: 25, admission: 15, ranking: 10 },
};
const personas: [string, Profile][] = [
  ['A เก่งมาก อยากเรียนแพทย์', { gpa: 3.9, exam_score: 88, budget: 120000, preferred_region: 'กลาง', interest_field: 'แพทยศาสตร์' }],
  ['B กลางๆ คอม ภาคเหนือ (ไม่บอกจังหวัด)', { gpa: 3.2, exam_score: 60, budget: 50000, preferred_region: 'เหนือ', interest_field: 'คอมพิวเตอร์และไอที' }],
  ['B2 เหมือน B แต่บ้านอยู่พิษณุโลก', { gpa: 3.2, exam_score: 60, budget: 50000, preferred_region: 'เหนือ', interest_field: 'คอมพิวเตอร์และไอที', home_province: 'พิษณุโลก' }],
  ['B3 เหมือน B แต่บ้านอยู่ภูเก็ต', { gpa: 3.2, exam_score: 60, budget: 50000, preferred_region: 'ทั้งหมด', interest_field: 'คอมพิวเตอร์และไอที', home_province: 'ภูเก็ต' }],
  ['C คะแนนน้อย บริหาร อีสาน', { gpa: 2.3, exam_score: 35, budget: 40000, preferred_region: 'ตะวันออกเฉียงเหนือ', interest_field: 'บริหารธุรกิจและบัญชี' }],
  ['D งบน้อย วิศวะ ใต้', { gpa: 3.0, exam_score: 55, budget: 30000, preferred_region: 'ใต้', interest_field: 'วิศวกรรมศาสตร์' }],
  ['E คะแนนน้อย งบสูง อยากเรียนแพทย์', { gpa: 2.2, exam_score: 32, budget: 1000000, preferred_region: 'กลาง', interest_field: 'แพทยศาสตร์' }],
];

console.log('จำนวนหลักสูตรต่อกลุ่มสาขา:', FIELDS.map((f) => `${f}=${progs.filter((p) => p.field === f).length}`).join(', '));
for (const [name, pf] of personas) {
  const r = evaluate(progs, crit, DEF, pf, { matchField: true, withinBudget: true }); // ค่าเริ่มต้นเดียวกับหน้าวิเคราะห์
  if (!r.results.length) {
    const inField = r.excluded.filter((x) => !x.flags.includes('field_mismatch'));
    console.log(`\n=== ${name} | ไม่มีตัวเลือก: ในสาขามี ${inField.length} หลักสูตร เกินงบทั้งหมด ถูกสุด ${Math.min(...inField.map((x) => x.program.yearly_cost!))}/ปี (งบ ${pf.budget})`);
    continue;
  }
  console.log(`\n=== ${name} | ตัวเลือก ${r.summary.candidates} | เสถียร ${r.sensitivity?.stability}% | ห่างอันดับ 2: ${r.summary.topGap}`);
  for (const x of r.results.slice(0, 5)) {
    console.log(`  ${x.rank}. ${x.program.short_name} ${x.program.program_name} | ${x.score} | ติด ${x.admissionChance}% ${x.risk} | ${x.program.tuition_fee}/เทอม ${x.program.yearly_cost}/ปี | ${x.distanceKm ?? '-'} กม. | ${x.flags.filter((f) => f !== 'region_mismatch').join(',') || 'ok'}`);
  }
  const top10 = r.results.slice(0, 10);
  console.log(`  ใน 10 อันดับแรก: ไม่ผ่านเกณฑ์ ${top10.filter((x) => x.flags.some((f) => f.startsWith('below'))).length}, เกินงบ ${top10.filter((x) => x.flags.includes('over_budget')).length}, เสี่ยงสูง ${top10.filter((x) => x.risk === 'high').length}, คะแนนซ้ำกับตัวก่อนหน้า ${top10.filter((x, i) => i > 0 && x.score === top10[i - 1].score).length}`);
  console.log('  อันดับ 1 ตาม preset: ' + Object.entries(PRESETS).map(([k, w]) => { const t = evaluate(progs, crit, W(w), pf, { matchField: true, withinBudget: true, sensitivity: false }).results[0]; return `${k} → ${t.program.short_name} ${t.program.program_name}`; }).join(' | '));
}
