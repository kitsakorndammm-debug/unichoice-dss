/**
 * แปลงช่อง "ค่าใช้จ่าย" (cost) ที่มหาวิทยาลัยแจ้ง ทปอ. ไว้รายหลักสูตรในไฟล์ courses.json ของ mytcas เป็นค่าเทอมต่อภาค → tcas-cost.json
 *   { รหัสหลักสูตร: [ค่าเทอมต่อภาค (บาท), ชนิด, ข้อความเดิม] }
 *   ชนิด: 'sem' = แจ้งเป็นต่อภาคอยู่แล้ว | 'total' = แจ้งเป็นยอดตลอดหลักสูตร หารจำนวนภาค (ปี × 2) | 'first' = แจ้งเฉพาะยอดภาคแรกเข้า (โดยประมาณ)
 * ใช้: node db/tools/build-cost.cjs <courses.json ปีที่ตรงกับไฟล์สถิติ> [courses.json ปีอื่นเป็นตัวสำรอง ...]
 *   ไฟล์ปัจจุบัน: https://my-tcas.s3.ap-southeast-1.amazonaws.com/mytcas/courses.json (เป็น gzip)
 *   ไฟล์ปีก่อน:   https://web.archive.org/web/<วันที่>id_/<ลิงก์เดียวกัน>
 * ข้อความที่เป็นลิงก์ / 0 / - / ระบุเป็นช่วง จะไม่ถูกแปลง (ไม่เดา)
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('ระบุไฟล์ courses.json'); process.exit(1); }
const load = (f) => { let b = fs.readFileSync(f); if (b[0] === 0x1f) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8')); };

const num = (s) => Number(String(s).replace(/,/g, '').replace(/\.\d+$/, ''));
const N = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{4,7}(?:\\.\\d+)?)';   // 16,000 | 16000 | 21,000.00
const TERM = '(?:ภาคการศึกษา|ภาคเรียน|ภาค|เทอม)';
/** จำนวนภาคปกติตลอดหลักสูตร ดูจากชื่อปริญญา (ไม่ระบุ = 4 ปี 8 ภาค) */
function terms(name) {
  if (/แพทยศาสตรบัณฑิต|ทันตแพทย|สัตวแพทย|เภสัช|^(พ|ท|สพ|ภ)\.บ\./.test(name) && !/การแพทย์แผน/.test(name)) return 12;
  if (/สถาปัตยกรรมศาสตรบัณฑิต|^สถ\.บ\.|ภูมิสถาปัตย|5 ?ปี/.test(name)) return 10;
  return 8;
}

function parse(raw, x) {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t || /^[-0.]+$/.test(t)) return null;
  const name = `${x.program_name_th}`;
  let m;
  // มทร.รัตนโกสินทร์แจ้งข้อความเดียวทั้งมหาวิทยาลัย: "สายวิทย์ 15000 สายสังคม 12000"
  if ((m = t.match(new RegExp(`สายวิทย์\\s*${N}\\s*สายสังคม\\s*${N}`)))) {
    const sci = /^(วศ|วท|ค\.อ|อส|ทล|สถ)\.?บ?\.|วิศวกรรม|วิทยาศาสตร|เทคโนโลยี|สถาปัตย/.test(name) || /วิศวกรรม|วิทยาศาสตร์|สถาปัตย|อุตสาหกรรม|เพาะช่าง/.test(x.faculty_name_th);
    return [num(sci ? m[1] : m[2]), 'sem'];
  }
  // ภาคปกติ/ภาคถัดไป มาก่อนยอดภาคแรกเข้า
  if ((m = t.match(new RegExp(`(?:${TERM}ถัดไป|เทอมต่อไป(?:เทอมละ)?|ภาคเรียนปกติ|ภาคอื่น ?ๆ ?(?:ประมาณ)?)\\s*${N}`)))) return [num(m[1]), 'sem'];
  if ((m = t.match(new RegExp(`ค่าลงทะเบียนเรียน\\s*${N}\\s*บาท\\s*ต่อ${TERM}`)))) return [num(m[1]), 'sem'];
  if ((m = t.match(new RegExp(`${N}\\s*(?:\\.-)?\\s*(?:บาท)?\\s*(?:\\.-)?\\s*(?:ต่อ|/)\\s*${TERM}`)))) return [num(m[1]), 'sem'];
  if ((m = t.match(new RegExp(`${N}\\s*บาท\\s*[xX×]\\s*\\d+\\s*${TERM}`)))) return [num(m[1]), 'sem'];          // "21,000 บาท x 8 ภาคการศึกษา = 168,000 บาท"
  if ((m = t.match(new RegExp(`ปีละ\\s*${N}`)))) return [Math.round(num(m[1]) / 2), 'sem'];
  if ((m = t.match(new RegExp(`(?:${TERM}ละ|ต่อ${TERM})\\s*${N}`)))) return [num(m[1]), 'sem'];
  if (/-\s*\d/.test(t.replace(/\.-/g, '')) && /ประมาณ/.test(t)) return null;                          // "ประมาณ 88,000 - 98,000" ระบุเป็นช่วง
  if ((m = t.match(new RegExp(`${N}\\s*(?:บาท)?\\s*\\(?ตลอดหลักสูตร`))) || (m = t.match(new RegExp(`ตลอดหลักสูตร\\s*(?:ประมาณ)?\\s*${N}`)))) return [Math.round(num(m[1]) / terms(name) / 100) * 100, 'total'];
  if ((m = t.match(new RegExp(`แรกเข้า(?:ประมาณ)?\\s*${N}`)))) return [num(m[1]), 'first'];
  // ตัวเลขเดี่ยว (อาจมีคำนำ เช่น "อัตราค่าเล่าเรียน 16,000", "แบบเหมาจ่าย 12,000 บาท"): 60,000 ขึ้นไปถือเป็นยอดตลอดหลักสูตร
  if ((m = t.match(new RegExp(`^(?:อัตรา)?(?:ค่าเล่าเรียน|ค่าธรรมเนียมการศึกษา)?\\s*(?:แบบ)?(?:เหมาจ่าย)?\\s*${N}(?:\\s*บาท)?$`)))) { const v = num(m[1]); return v >= 60000 ? [Math.round(v / terms(name) / 100) * 100, 'total'] : v >= 1000 ? [v, 'sem'] : null; }
  return null;
}

const out = {}, stat = {};
for (const [i, f] of files.entries()) {
  for (const x of load(f)) {
    const id = String(x.program_id).trim();
    if (out[id]) continue;                         // ไฟล์แรก (ปีที่ตรงกับสถิติ) มาก่อน
    const r = parse(x.cost, x);
    const s = (stat[x.university_name_th] ??= { n: 0, ok: 0, bad: new Set() });
    if (i === 0 || r) s.n++;
    if (!r) { if (String(x.cost ?? '').trim().length > 3) s.bad.add(String(x.cost).replace(/\s+/g, ' ').slice(0, 90)); continue; }
    if (r[0] < 1000 || r[0] > 500000) { s.bad.add(`ผิดช่วง ${r[0]}: ${String(x.cost).slice(0, 60)}`); continue; }
    s.ok++;
    out[id] = [r[0], r[1], String(x.cost).replace(/\s+/g, ' ').trim().slice(0, 110)];
  }
}
fs.writeFileSync(path.join(__dirname, 'tcas-cost.json'), JSON.stringify(out));
console.log(`แปลงได้ ${Object.keys(out).length} หลักสูตร → db/tools/tcas-cost.json`);
if (process.argv.includes('--report')) for (const [u, s] of Object.entries(stat)) {
  console.log(`${u.slice(0, 40).padEnd(40)} ${String(s.ok).padStart(3)}/${String(s.n).padStart(3)}${s.bad.size ? '  ✖ ' + [...s.bad].slice(0, 2).join(' ‖ ') : ''}`);
}
