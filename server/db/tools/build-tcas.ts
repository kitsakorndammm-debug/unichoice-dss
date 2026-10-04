/**
 * สร้าง db/tcas.ts จากสถิติทางการ "คะแนนสูงสุด-ต่ำสุด TCAS รอบ 3 (Admission)" ของ ทปอ.
 *   TCAS        = สถิติของหลักสูตรที่ระบบกำหนดไว้เอง (BY_UNI ใน data.ts) จับคู่ด้วยชื่อ
 *   TCAS_EXTRA  = หลักสูตรภาคปกติอื่นทั้งหมดของมหาวิทยาลัย/วิทยาเขตในระบบ ที่ไม่ได้ถูกจับคู่ข้างบน
 * แหล่งข้อมูล: https://www.mytcas.com/stat/  (ไฟล์ Excel เช่น TCAS69-R3-MinMax-10June26.xlsx)
 * ใช้: npx tsx db/tools/build-tcas.ts <ไฟล์.xlsx> [--report] [--write] [--list <ชื่อย่อ>]     (ต้องมีแพ็กเกจ xlsx: npm i --no-save xlsx)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { allUniversities as universities, BY_UNI, CAMPUS, OFFICIAL_NAME } from '../data.js';

const file = process.argv[2];
if (!file) { console.error('ระบุไฟล์ .xlsx'); process.exit(1); }
const require = createRequire(path.resolve(process.cwd(), 'x.js'));
const X = (() => { try { return require('xlsx'); } catch { return createRequire(path.resolve(path.dirname(file), 'x.js'))('xlsx'); } })();
const rows: any[][] = X.utils.sheet_to_json(X.readFile(file).Sheets.Sheet1, { header: 1, defval: '' }).slice(1);

/** แก้คำสะกดผิด/คำต่อท้ายในชื่อคณะของไฟล์ทางการ เช่น "คณะวิศวกรรมศาสตร์ (กทม.)", "คณะ เทคโนโลยีอุตสาหกรรม" */
const fixFaculty = (s: string) => s.replace(/\s*\(กทม\.\)/, '').replace(/\s+/g, ' ').trim().replace(/^คณะ /, 'คณะ').replace('สังคมศษสตร์', 'สังคมศาสตร์').replace('วิทยาศาตร์', 'วิทยาศาสตร์');

/** แก้คำสะกดผิดในชื่อหลักสูตรของไฟล์ทางการ */
const fixCourse = (s: string) => s.trim().replace('บัญฑิต', 'บัณฑิต').replace('หลักสุตร', 'หลักสูตร').replace('เทคโนโลย๊', 'เทคโนโลยี').replace('วิศกรรม', 'วิศวกรรม');

interface Off { id: string; project: string; campus: string; faculty: string; course: string; detail: string; major: string; cap: number; applied: number; passed: number; max: number; min: number }
const byUni = new Map<string, Off[]>();
for (const r of rows) {
  const o: Off = { id: String(r[2]).trim(), project: String(r[4]).trim(), campus: String(r[1]), faculty: fixFaculty(String(r[5])), course: fixCourse(String(r[6])), detail: String(r[7]).trim(), major: String(r[8]).trim(), cap: Number(r[10]) || 0, applied: Number(r[11]) || 0, passed: Number(r[12]) || 0, max: Number(r[13]) || 0, min: Number(r[14]) || 0 };
  (byUni.get(String(r[0]).trim()) ?? byUni.set(String(r[0]).trim(), []).get(String(r[0]).trim())!).push(o);
}

// ชื่อที่ไม่ตรงตัวระหว่างระบบกับไฟล์ทางการ: 'ชื่อย่อ|ชื่อในระบบ' → ข้อความที่ต้องพบในชื่อหลักสูตรทางการ ('' = ไม่จับคู่)
const ALIAS: Record<string, string> = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'tcas-alias.json'), 'utf8'));

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[()（）]/g, '');
const fac = (s: string) => norm(s).replace(/^(คณะ|สำนักวิชา|วิทยาลัย)/, '');
const SPECIAL = /นานาชาติ|ภาษาอังกฤษ|ภาคพิเศษ|โครงการพิเศษ|สองภาษา|ทวิภาษา|international|ต่อเนื่อง|เทียบโอน|สมทบ|พิเศษ|สองปริญญา|2 ปริญญา|หลักสูตรควบ|ควบปริญญา| และ [ก-ฮ]{1,3}\.บ\./i;
/** หลักสูตรนานาชาติ/ภาคพิเศษ/ต่อเนื่อง ค่าเทอมคนละอัตรากับภาคปกติ จึงไม่นำมาใช้ (มฟล. สอนเป็นภาษาอังกฤษเป็นปกติ จึงไม่นับคำนี้) */
const isSpecial = (o: Off, short: string) => {
  let t = o.course + o.detail + o.major;
  if (short === 'มฟล.') t = t.replace(/จัดการเรียนการสอนเป็นภาษาอังกฤษ/g, '');
  return SPECIAL.test(t);
};

/** ชื่อสาขาที่เป็นไปได้ของแถวทางการ หลังตัดคำนำหน้า (หลักสูตร / อักษรย่อปริญญา / ...บัณฑิต / สาขาวิชา / วิชาเอก / แขนง) */
function names(o: Off): string[] {
  const res: string[] = [];
  for (const part of o.course.split('/')) {
    let c = norm(part).replace(/^หลักสูตร/, '').replace(/^([ก-ฮ]{1,3}\.)+บ\.?/, '');
    const deg = c.match(/^(.*?ศาสตร)บัณฑิต/);
    c = c.replace(/^.*?บัณฑิต/, '').replace(/^(สาขาวิชา|สาขา|วิชาเอก)/, '');
    res.push(c || (deg ? deg[1] + '์' : ''));
  }
  const m = norm(o.major).replace(/^(สาขาวิชา|สาขา|วิชาเอก|แขนงวิชา|แขนง)/, '');
  if (m) res.push(m);
  // คำที่คั่นด้วยช่องว่าง/วงเล็บ เช่น "วิทยาศาสตรบัณฑิต (เคมี) เคมี", "วศ.บ. วิศวกรรมคอมพิวเตอร์", "วิชาเอกพืชไร่ แผนที่ 2"
  for (const tok of `${o.course} ${o.major}`.split(/[\s()\/,–-]+/)) {
    const t = tok.replace(/^(สาขาวิชา|สาขา|วิชาเอก|แขนงวิชา|แขนง|หลักสูตร)/, '');
    if (t.length >= 3 && !/บัณฑิต$|^\S{1,3}\.บ\.?$/.test(t)) res.push(t);
    // ชื่อปริญญาที่ใช้เป็นชื่อหลักสูตร เช่น นิติศาสตรบัณฑิต → นิติศาสตร์, บัญชีบัณฑิต → การบัญชี
    const d = tok.replace(/^หลักสูตร/, '').match(/^(.+?)บัณฑิต$/);
    if (d) res.push(d[1].endsWith('ศาสตร') ? d[1] + '์' : d[1], ...(DEGREE_ALIAS[d[1]] ?? []));
  }
  return [...new Set(res.filter(Boolean))];
}
const DEGREE_ALIAS: Record<string, string[]> = { 'บัญชี': ['การบัญชี'], 'สถาปัตยกรรมศาสตร': ['สถาปัตยกรรม'], 'ศึกษาศาสตร': ['การศึกษา'], 'การศึกษา': ['ศึกษาศาสตร์'] };

/** ชื่อหลักสูตรสำหรับแสดงผล: ตัดคำนำหน้าและคำต่อท้ายที่ไม่ใช่ชื่อสาขาออก */
/** ตัดส่วนที่ไม่ใช่ชื่อสาขาออกจากข้อความหนึ่งท่อน (ใช้ทั้งกับชื่อหลักสูตรและชื่อวิชาเอก) */
function clean(raw: string): string {
  const unwrap = (s: string) => s.replace(/^\(([^()]+)\)$/, '$1').trim();
  // "ภ.สถ.บ.(ภูมิสถาปัตยกรรมศาสตรบัณฑิต)" → ตัดคำนำหน้าและอักษรย่อ แล้วแกะวงเล็บที่ครอบทั้งชื่อ
  let c = raw.trim(), deg = '';
  // บางแห่งเขียนชื่อปริญญาซ้ำสองรอบ เช่น "ศึกษาศาสตรบัณฑิต (ศึกษาศาสตร์) ศึกษาศาสตรบัณฑิต วิชาเอกพลศึกษา" จึงตัดซ้ำจนไม่เปลี่ยน
  for (let i = 0; i < 4; i++) {
    const before = c;
    // อักษรย่อปริญญา เช่น "วท.บ. เคมี", "บธ.บ.บริหารธุรกิจ" (ไม่กินตัว บ ของคำถัดไป), "ค.บ. 4 ปี คณิตศาสตร์"
    c = unwrap(c.replace(/^หลักสูตร\s*/, '').replace(/^([ก-ฮ]{1,3}\.)+(\s*บ\.?(?![ก-๙]))?\s*/, '').replace(/^\d\s*ปี\s+/, ''));
    const d = c.match(/^([^\s()]*?)บัณฑิต/);
    if (d?.[1]) deg = d[1];
    c = c.replace(/^[^\s()]*?บัณฑิต\s*/, '').trim();
    c = c.replace(/^(สาขาวิชา|สาขา|วิชาเอกเดี่ยว|วิชาเอก|แขนงวิชา|แขนง)\s*:?\s*/, '');
    c = c.replace(/^\(([^()]+)\)\s*(?=\S)/, '');          // "(เคมี) เคมี" → "เคมี"
    if (c === before) break;
  }
  c = c.replace(/\(([ก-ฮ]{1,3}\.)+\s*บ\.?[^()]*\)/g, '').replace(/\s*-\s*([ก-ฮ]{1,3}\.)+\s*บ\..*$/, '')
    .replace(/\s*ปริญญาตรี\s*\d\s*ปี.*$/, '').replace(/\s*ภาคปกติ/g, '').replace(/\s*\(\s*(หลักสูตร\s*)?\d\s*ปี\s*\)/g, '').replace(/\s+\d\s*ปี\s*$/, '').replace(/\s*แผนที่\s*\d+\s*$/, '')
    .replace(/\s*\(?จัดการเรียนการสอนเป็นภาษาอังกฤษ\)?/, '').replace(/\s*\(\s*\)/g, '');
  c = unwrap(c.trim());
  if (c) return c;
  if (deg) return /ศาสตร$/.test(deg) ? deg + '์' : /แพทย$/.test(deg) ? deg + '์' : DEGREE_ALIAS[deg]?.[0] ?? deg;
  return '';
}

// หลักสูตรที่ไฟล์ระบุเพียงอักษรย่อปริญญา เช่น "พย.บ."
const ABBR: Record<string, string> = {
  'พย.บ.': 'พยาบาลศาสตร์', 'พ.บ.': 'แพทยศาสตร์', 'ท.บ.': 'ทันตแพทยศาสตร์', 'ภ.บ.': 'เภสัชศาสตร์', 'สพ.บ.': 'สัตวแพทยศาสตร์', 'น.บ.': 'นิติศาสตร์', 'ศ.บ.': 'เศรษฐศาสตร์',
  'บช.บ.': 'การบัญชี', 'บธ.บ.': 'บริหารธุรกิจ', 'ร.บ.': 'รัฐศาสตร์', 'รป.บ.': 'รัฐประศาสนศาสตร์', 'สถ.บ.': 'สถาปัตยกรรม', 'นศ.บ.': 'นิเทศศาสตร์', 'กภ.บ.': 'กายภาพบำบัด', 'ทพ.บ.': 'เทคนิคการแพทย์', 'ส.บ.': 'สาธารณสุขศาสตร์',
};

function pretty(o: Off): string {
  const parts = o.course.split('/').map((p) => clean(p) || ABBR[p.replace(/\s+/g, '')] || o.faculty.replace(/^(คณะ|สำนักวิชา|วิทยาลัย)/, '').trim());
  let name = [...new Set(parts)].join(' / ');
  const m = clean(o.major);
  // บางสถาบันใส่ "ภาษาไทย" ในช่องวิชาเอกเพื่อบอกภาษาที่สอน ไม่ใช่ชื่อวิชาเอก (เช่น พยาบาลศาสตรบัณฑิต | ภาษาไทย)
  const langLabel = m === 'ภาษาไทย' && !/ศิลปศาสตร|ครุศาสตร|ศึกษาศาสตร|การศึกษา|อักษร|ภาษา|^(ศศ|ค|กศ|ศษ|อ)\.บ/.test(o.course);
  if (m && !/^ไม่แยก/.test(m) && !langLabel) {
    if (norm(m).includes(norm(name))) name = m;
    else if (!norm(name).includes(norm(m))) name += ` (${m})`;
  }
  if (/^ไม่แยก/.test(name)) name = o.faculty.replace(/^(คณะ|สำนักวิชา|วิทยาลัย)/, '').trim() + ' (ไม่แยกสาขา)';
  name = name.replace(/\s+/g, ' ').slice(0, 140);
  if (!/[ก-๙A-Za-z]{3}/.test(name)) throw new Error(`ตั้งชื่อหลักสูตรไม่ได้: "${o.course}" | "${o.major}" → "${name}"`);
  return name;
}

function candidates(list: Off[], name: string, key: string): Off[] {
  const want = ALIAS[key];
  if (want === '') return [];
  const n = norm(want ?? name);
  return list.filter((o) => (want ? norm(o.faculty + '|' + o.course + '|' + o.major).includes(n) : names(o).includes(n)));
}

// แพทย์/ทันตแพทย์/สัตวแพทย์/เภสัช รับผ่าน กสพท ซึ่งไฟล์ทางการแยกเป็น "สถาบัน" ต่างหาก โดยชื่อมหาวิทยาลัยอยู่ในช่องคณะ
const KSPT_ORG = 'กลุ่มสถาบันแพทยศาสตร์แห่งประเทศไทย';
const KSPT_DEGREE: [RegExp, string][] = [[/^แพทยศาสตร์/, 'แพทยศาสตรบัณฑิต'], [/^ทันตแพทยศาสตร์/, 'ทันตแพทยศาสตรบัณฑิต'], [/^สัตวแพทยศาสตร์/, 'สัตวแพทยศาสตรบัณฑิต'], [/^เภสัชศาสตร์/, 'เภสัชศาสตรบัณฑิต']];
function kspt(official: string, name: string, faculty: string): Off[] {
  const deg = KSPT_DEGREE.find(([re]) => re.test(name))?.[1];
  if (!deg) return [];
  // ไม่นับโครงการร่วมกับหน่วยงานอื่น (กองทัพอากาศ, สำนักการแพทย์ กทม.) ซึ่งเป็นคนละที่นั่งกับของคณะ
  const c = (byUni.get(KSPT_ORG) ?? []).filter((o) => o.passed > 0 && o.min > 0 && o.course.startsWith(deg) && norm(o.faculty).includes(norm(official)) && !/กองทัพ|สำนักการแพทย์/.test(o.faculty));
  const own = c.filter((o) => norm(o.faculty).includes(fac(faculty)));
  return own.length ? own : c;
}

// เกณฑ์คัดเลือกรอบ 3 รายหลักสูตรจาก mytcas (สร้างด้วย fetch-criteria.cjs): สัดส่วนน้ำหนัก GPAX ในคะแนนรวม และ GPAX ขั้นต่ำ
interface Crit { project: string; year: string; gpax: number; minGpax: number; w: Record<string, number> | null }
const CRIT: Record<string, Crit[]> = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'tcas-criteria.json'), 'utf8'));
const critOf = (o: Off) => { const k = CRIT[o.id]; return k ? k.find((x) => x.project === o.project) ?? k[0] : null; };
// หลักสูตรที่ยังไม่มีประกาศเกณฑ์ ใช้ค่ากลางของหลักสูตรอื่นในสถาบันเดียวกัน (ไม่มีเลย = 0 คือเทียบด้วยคะแนนสอบล้วน)
const uniMedian = new Map<string, number>();
for (const [name, list] of byUni) {
  const w = list.map(critOf).filter((c): c is Crit => !!c).map((c) => c.gpax).sort((a, b) => a - b);
  if (w.length) uniMedian.set(name, w[w.length >> 1]);
}
/** { สัดส่วน GPAX (%), มาจากประกาศของหลักสูตรเองหรือไม่, GPAX ขั้นต่ำ } */
function gpaxOf(o: Off, official: string) {
  const c = critOf(o);
  return c ? { gpax: c.gpax, gpaxKnown: true, minGpa: Math.min(4, Math.max(0, c.minGpax)), w: c.w ?? null } : { gpax: uniMedian.get(official) ?? 0, gpaxKnown: false, minGpa: 0, w: null };
}

// ค่าใช้จ่ายรายหลักสูตรที่มหาวิทยาลัยแจ้ง ทปอ. (สร้างด้วย build-cost.cjs): รหัสหลักสูตร → [ค่าเทอมต่อภาค, ชนิด, ข้อความเดิม]
const COST: Record<string, [number, string, string]> = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'tcas-cost.json'), 'utf8'));
/** ค่าเทอมทางการของกลุ่มแถวเดียวกัน (แถวไหนมีก็ใช้แถวนั้น) — fee 0 = ไม่มีข้อมูล */
function costOf(rows: Off[]) {
  const c = rows.map((o) => COST[o.id]).find(Boolean);
  return c ? { fee: c[0], feeKind: c[1], feeText: c[2] } : { fee: 0, feeKind: '', feeText: '' };
}

interface Stat { name: string; faculty: string; cap: number; applied: number; min: number; max: number; gpax: number; gpaxKnown: boolean; minGpa: number; w: Record<string, number> | null }
const r2 = (n: number) => Math.round(n * 100) / 100;
const out: Record<string, Stat> = {};
const extra: (Stat & { uni: string; course: string; fee: number; feeKind: string; feeText: string })[] = [];
const report: string[] = [];
let matched = 0, total = 0;

for (const u of universities) {
  const official = OFFICIAL_NAME[u.short] ?? u.name;
  // ใช้เฉพาะวิทยาเขตที่ระบบมีข้อมูลค่าเทอมและพิกัด ไม่ปนกับวิทยาเขตอื่น
  const campus = CAMPUS[u.short];
  const list = (byUni.get(official) ?? []).filter((o) => o.passed > 0 && o.min > 0 && (!campus || campus.some((c) => o.campus.includes(c))));
  if (!byUni.has(official)) report.push(`!! ไม่พบสถาบัน "${official}" ในไฟล์`);
  const used = new Set<string>();

  // ---------- 1) หลักสูตรที่ระบบกำหนดไว้เอง ----------
  for (const [name, faculty] of BY_UNI[u.short] ?? []) {
    total++;
    const key = `${u.short}|${name}`;
    let c = candidates(list, name, key);
    if (c.some((o) => fac(o.faculty) === fac(faculty))) c = c.filter((o) => fac(o.faculty) === fac(faculty));
    else if (new Set(c.map((o) => o.faculty)).size > 1 && !ALIAS[key]) { report.push(`-- กำกวม: ${key} (${faculty}) → ${[...new Set(c.map((o) => o.faculty))].join(' / ')}`); continue; }
    if (c.length > 1 && c.some((o) => !isSpecial(o, u.short))) c = c.filter((o) => !isSpecial(o, u.short));
    c.sort((a, b) => b.cap - a.cap);
    const top = c[0];
    if (!top) {
      const k = kspt(official, name, faculty);
      if (!k.length) { report.push(`-- ไม่พบ: ${key} (${faculty})`); continue; }
      matched++;
      out[key] = {
        name: `${k[0].course.replace(/\s*\(.*$/, '')} · รับผ่าน กสพท`, faculty: k[0].faculty.replace(/\s*\((สถาบันเอกชน|สาขาวิชา[^)]*|โรงพยาบาล[^)]*)\)/g, ''),
        cap: k.reduce((a, o) => a + o.cap, 0), applied: Math.max(...k.map((o) => o.applied)), min: r2(Math.min(...k.map((o) => o.min))), max: r2(Math.max(...k.map((o) => o.max))), ...gpaxOf(k[0], KSPT_ORG),
      };
      report.push(`ok(กสพท) ${key}  ←  ${k.map((o) => o.faculty).join(' + ')} | ต่ำสุด ${out[key].min} สูงสุด ${out[key].max}`);
      continue;
    }
    matched++;
    // หลักสูตรเดียวกันอาจมีหลายแถว (หลายเกณฑ์คัดเลือก/หลายวิชาเอกในคณะเดียวกัน): ใช้คะแนนต่ำสุดของทุกแถว สูงสุดของทุกแถว และจำนวนรับของแถวที่รับมากสุด
    const same = c.filter((o) => o.faculty === top.faculty && o.course === top.course);
    for (const o of same) used.add(`${o.faculty}|${o.course}|${o.major}`);
    const o = { ...top, min: Math.min(...same.map((x) => x.min)), max: Math.max(...same.map((x) => x.max)), applied: Math.max(...same.map((x) => x.applied)) };
    out[key] = { name: (o.course.replace(/^หลักสูตร/, '') + (same.length === 1 && o.major ? ` (${o.major})` : '')).trim(), faculty: o.faculty, cap: o.cap, applied: o.applied, min: r2(o.min), max: r2(o.max), ...gpaxOf(top, official) };
    report.push(`ok${fac(o.faculty) === fac(faculty) ? '' : '?'} ${key}${fac(o.faculty) === fac(faculty) ? '' : ` [ในระบบ: ${faculty}]`}  ←  ${o.faculty} | ${o.course} ${same.length === 1 ? o.major : ''} | รับ ${o.cap} ต่ำสุด ${o.min.toFixed(1)} สูงสุด ${o.max.toFixed(1)}${same.length > 1 ? `  (รวม ${same.length} แถว)` : ''}`);
  }

  // ---------- 2) หลักสูตรภาคปกติอื่นทั้งหมดของวิทยาเขตนี้ ----------
  const curated = new Set((BY_UNI[u.short] ?? []).map(([n]) => norm(n)));
  const groups = new Map<string, Off[]>();
  for (const o of list) {
    if (isSpecial(o, u.short) || used.has(`${o.faculty}|${o.course}|${o.major}`)) continue;
    const k = `${o.faculty}|${o.course}|${o.major}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(o);
  }
  const taken = new Map<string, number>();
  for (const g of groups.values()) {
    const top = [...g].sort((a, b) => b.cap - a.cap)[0];
    let name = pretty(top);
    if (curated.has(norm(name)) || taken.has(norm(name))) name = `${name} · ${top.faculty.replace(/^คณะ/, '')}`.slice(0, 148);
    if (curated.has(norm(name))) continue;
    const prev = taken.get(norm(name));
    const stat = { uni: u.short, name, course: top.course.replace(/\s+/g, ' '), faculty: top.faculty, cap: top.cap, applied: Math.max(...g.map((x) => x.applied)), min: r2(Math.min(...g.map((x) => x.min))), max: r2(Math.max(...g.map((x) => x.max))), ...gpaxOf(top, official), ...costOf([top, ...g]) };
    if (prev != null) {   // ชื่อและคณะซ้ำกันจริง: รวมเป็นรายการเดียว
      const p = extra[prev];
      extra[prev] = { ...p, cap: Math.max(p.cap, stat.cap), applied: Math.max(p.applied, stat.applied), min: Math.min(p.min, stat.min), max: Math.max(p.max, stat.max) };
      continue;
    }
    taken.set(norm(name), extra.length);
    extra.push(stat);
  }
}

console.log(`หลักสูตรที่กำหนดไว้เอง: จับคู่ได้ ${matched} / ${total} | หลักสูตรอื่นจากไฟล์: ${extra.length}`);
if (process.argv.includes('--report')) console.log(report.join('\n'));
if (process.argv.includes('--faculties')) {
  for (const u of universities) {
    const f = new Map<string, number>();
    for (const e of extra) if (e.uni === u.short) f.set(e.faculty, (f.get(e.faculty) ?? 0) + 1);
    console.log(`${u.short}: ${[...f].map(([k, v]) => `${k} (${v})`).join(' ; ')}`);
  }
}
if (process.argv.includes('--list')) {
  const want = process.argv[process.argv.indexOf('--list') + 1];
  const u = universities.find((x) => x.short === want)!;
  for (const o of byUni.get(OFFICIAL_NAME[u.short] ?? u.name) ?? []) console.log(`${o.campus} | ${o.faculty} | ${o.course} | ${o.major} | ${o.detail.slice(0, 30)} | รับ ${o.cap} min ${o.min}`);
}
if (process.argv.includes('--write')) {
  const src = path.basename(file);
  fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../tcas.ts'),
    `// สร้างอัตโนมัติด้วย db/tools/build-tcas.ts จากไฟล์ทางการของ ทปอ. (${src}) — อย่าแก้ด้วยมือ\n` +
    `// คะแนนต่ำสุด/สูงสุดของผู้ผ่านการคัดเลือก และจำนวนรับ ในรอบ 3 Admission (คะแนนรวมถ่วงน้ำหนักตามเกณฑ์ของแต่ละหลักสูตร เต็ม 100)\n` +
    `// gpax = สัดส่วนน้ำหนัก GPAX ในคะแนนรวมตามเกณฑ์รอบ 3 (%) | gpaxKnown = มาจากประกาศของหลักสูตรเอง (false = ค่ากลางของสถาบัน) | minGpa = GPAX ขั้นต่ำที่ประกาศ (0 = ไม่กำหนด/ไม่ทราบ) | w = สัดส่วนน้ำหนักรายวิชา (%) ตามประกาศ (null = ไม่ทราบ)\n` +
    `export interface TcasStat { name: string; faculty: string; cap: number; applied: number; min: number; max: number; gpax: number; gpaxKnown: boolean; minGpa: number; w: Record<string, number> | null }\n` +
    `export const TCAS_SOURCE = '${src.match(/TCAS(\d+)/)?.[0] ?? 'TCAS'} รอบ 3 Admission';\n` +
    `// หลักสูตรที่ระบบกำหนดไว้เอง: 'ชื่อย่อมหาวิทยาลัย|ชื่อหลักสูตรในระบบ' → สถิติ\n` +
    `export const TCAS: Record<string, TcasStat> = ${JSON.stringify(out, null, 1)};\n` +
    `// หลักสูตรภาคปกติอื่นทั้งหมดในไฟล์ของมหาวิทยาลัย/วิทยาเขตที่อยู่ในระบบ: [ชื่อย่อ, คณะ, ชื่อหลักสูตร, รับ, สมัคร, ต่ำสุด, สูงสุด, ชื่อหลักสูตร/ปริญญาตามไฟล์, สัดส่วน GPAX ในเกณฑ์รอบ 3 (%), 1 = สัดส่วนมาจากประกาศของหลักสูตรเอง, GPAX ขั้นต่ำ, ค่าเทอมต่อภาคที่มหาวิทยาลัยแจ้ง ทปอ. (0 = ไม่มี), ชนิด (sem/total/first), ข้อความเดิม, สูตรคะแนนรายวิชา (%) หรือ null]\n` +
    `export const TCAS_EXTRA: [uni: string, faculty: string, name: string, cap: number, applied: number, min: number, max: number, course: string, gpax: number, gpaxKnown: number, minGpa: number, fee: number, feeKind: string, feeText: string, w: Record<string, number> | null][] = [\n` +
    extra.map((e) => ' ' + JSON.stringify([e.uni, e.faculty, e.name, e.cap, e.applied, e.min, e.max, e.course, e.gpax, e.gpaxKnown ? 1 : 0, e.minGpa, e.fee, e.feeKind, e.feeText, e.w])).join(',\n') + '\n];\n');
  console.log('เขียน db/tcas.ts แล้ว');
}
