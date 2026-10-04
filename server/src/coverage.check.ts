// สรุปความครอบคลุมของข้อมูลตั้งต้น: npx tsx src/coverage.check.ts [--skipped] [--sample <ชื่อย่อ>] [--field <กลุ่มสาขา>]
import { universities, programs, skippedNoFee, FIELDS } from '../db/data.js';

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] ?? '' : null);
console.log(`มหาวิทยาลัย/วิทยาเขต ${universities.length} | หลักสูตร ${programs.length} | มีสถิติจริง ${programs.filter((p) => p.scoreSource).length} | ข้ามเพราะไม่มีค่าเทอมรายคณะ ${skippedNoFee.length}\n`);
for (const u of universities) {
  const ps = programs.filter((p) => p.uni === u.short), sk = skippedNoFee.filter((s) => s.uni === u.short);
  const fees = ps.map((p) => p.fee);
  console.log(`${u.short.padEnd(14)} ${String(ps.length).padStart(4)} หลักสูตร | ข้าม ${String(sk.length).padStart(3)} | ค่าเทอม ${Math.min(...fees)}–${Math.max(...fees)}`);
}
console.log('\nจำนวนหลักสูตรต่อกลุ่มสาขา: ' + FIELDS.map((f) => `${f} ${programs.filter((p) => p.field === f).length}`).join(' | '));
if (arg('--skipped') !== null) {
  const by = new Map<string, number>();
  for (const s of skippedNoFee) by.set(`${s.uni} › ${s.faculty}`, (by.get(`${s.uni} › ${s.faculty}`) ?? 0) + 1);
  console.log('\nคณะที่ถูกข้าม (ไม่มีค่าเทอม):\n' + [...by].map(([k, v]) => `  ${k} (${v})`).join('\n'));
}
const s = arg('--sample');
if (s) for (const p of programs.filter((x) => x.uni === s)) console.log(`  [${p.field}] ${p.name} — ${p.faculty} | ${p.fee} | ${p.minScore}–${p.maxScore ?? '?'} รับ ${p.cap}`);
const f = arg('--field');
if (f) for (const p of programs.filter((x) => x.field === f && x.scoreSource && !x.desc.includes('·'))) console.log(`  ${p.uni} | ${p.name} — ${p.faculty}`);
