// ตรวจความสมเหตุสมผลของข้อมูลตั้งต้น: npx tsx src/data.check.ts
import { universities, programs, FIELDS } from '../db/data.js';
import { PROVINCES, distanceKm, distanceBetween } from './geo.js';

let bad = 0;
const check = (cond: boolean, msg: string) => { if (!cond) { bad++; console.log('✖ ' + msg); } };

check(Object.keys(PROVINCES).length === 77, `จำนวนจังหวัด = ${Object.keys(PROVINCES).length} (ควรเป็น 77)`);
for (const [n, [lat, lng]] of Object.entries(PROVINCES)) check(lat > 5.5 && lat < 20.5 && lng > 97.3 && lng < 105.7, `พิกัด ${n} อยู่นอกประเทศไทย: ${lat}, ${lng}`);
for (const u of universities) {
  check(u.short.length <= 20 && u.name.length <= 150, `ชื่อยาวเกินคอลัมน์: ${u.short}`);
  check(u.province in PROVINCES, `ไม่รู้จักจังหวัดของ ${u.short}: ${u.province}`);
  // พิกัดวิทยาเขตต้องอยู่ไม่ไกลจากตัวจังหวัดที่ระบุ (กันพิมพ์พิกัดผิด)
  const d = distanceBetween({ lat: u.lat, lng: u.lng }, { province: u.province });
  check(d != null && d <= 45, `พิกัด ${u.short} (${u.lat}, ${u.lng}) ห่างจากตัวจังหวัด${u.province} ${d} กม.`);
}

const seen = new Set<string>();
for (const p of programs) {
  const k = `${p.uni}|${p.name}`;
  check(!seen.has(k), `หลักสูตรซ้ำ: ${k}`); seen.add(k);
  check(p.fee >= (p.uni === 'ม.รามคำแหง' ? 1000 : 5000) && p.fee <= 500000, `ค่าเทอมผิดปกติ: ${k} = ${p.fee}`);
  check(p.gpaxWeight >= 0 && p.gpaxWeight <= 1 && (p.scoreSource != null || p.gpaxWeight === 0), `สัดส่วน GPAX ผิดช่วง: ${k} = ${p.gpaxWeight}`);
  if (p.scoreSource) check(p.minGpa >= 0 && p.minGpa <= 3.75 && p.maxScore != null && p.minScore > 0 && p.minScore <= p.maxScore && p.maxScore <= 100, `สถิติคะแนนจริงผิดช่วง: ${k} ${p.minScore}–${p.maxScore}`);
  else check(p.minGpa >= 2 && p.minGpa <= 3.75 && p.minScore >= 30 && p.minScore <= 88, `เกณฑ์ขั้นต่ำ (ประมาณ) ผิดช่วง: ${k}`);
  check(p.cap > 0 && p.rank >= 1, `จำนวนรับ/อันดับผิด: ${k}`);
}
for (const f of FIELDS) check(programs.filter((p) => p.field === f).length >= 5, `กลุ่มสาขา ${f} มีหลักสูตรน้อยกว่า 5`);
for (const u of universities) check(programs.some((p) => p.uni === u.short), `${u.short} ไม่มีหลักสูตร`);

// ระยะทางเส้นตรงที่รู้ค่าจริงโดยประมาณ (กม.) ยอมให้คลาด ±12%
const known: [string, string, number][] = [
  ['กรุงเทพมหานคร', 'เชียงใหม่', 585], ['กรุงเทพมหานคร', 'ขอนแก่น', 390], ['กรุงเทพมหานคร', 'สงขลา', 750], ['กรุงเทพมหานคร', 'ชลบุรี', 68],
  ['กรุงเทพมหานคร', 'พิษณุโลก', 340], ['กรุงเทพมหานคร', 'ภูเก็ต', 690], ['กรุงเทพมหานคร', 'อุบลราชธานี', 495], ['เชียงใหม่', 'เชียงราย', 150],
  ['กรุงเทพมหานคร', 'นครศรีธรรมราช', 590], ['ขอนแก่น', 'อุดรธานี', 110], ['กรุงเทพมหานคร', 'นครราชสีมา', 220],
];
for (const [a, b, km] of known) { const d = distanceKm(a, b)!; check(Math.abs(d - km) / km <= 0.12, `ระยะ ${a}–${b} = ${d} กม. (ควรราว ${km})`); }

// ค่าเทอมสูงสุด/ต่ำสุดต่อกลุ่มสาขา ไว้ดูด้วยตาว่ามีตัวไหนโดดผิดปกติ
for (const f of FIELDS) {
  const ps = programs.filter((p) => p.field === f).sort((a, b) => a.fee - b.fee);
  const lo = ps[0], hi = ps[ps.length - 1];
  console.log(`${f}: ${lo.fee} (${lo.uni}) – ${hi.fee} (${hi.uni} ${hi.name}) ×${(hi.fee / lo.fee).toFixed(1)}`);
}
console.log(bad ? `\nพบ ${bad} จุดที่ต้องดู` : '\nข้อมูลผ่านทุกข้อ');
process.exit(bad ? 1 : 0);
