/**
 * ดาวน์โหลดเกณฑ์คัดเลือกรอบ 3 รายหลักสูตรจาก mytcas แล้วสรุปเป็น tcas-criteria.json
 *   { รหัสหลักสูตร: [{ project: รหัสโครงการ, year: ปีการศึกษาของประกาศ, gpax: สัดส่วนน้ำหนัก GPAX ในคะแนนรวม (%), minGpax: GPAX ขั้นต่ำ,
 *                      w: สัดส่วนน้ำหนักรายวิชา (%) เช่น {"tgat":20,"a61":40,"a82":40} หรือ null ถ้าสูตรคิดคะแนนไม่ใช่ผลรวมถ่วงน้ำหนักธรรมดา }] }
 * ใช้: node db/tools/fetch-criteria.cjs <ไฟล์สถิติ.xlsx> [โฟลเดอร์แคช]     (ต้องมีแพ็กเกจ xlsx และต่ออินเทอร์เน็ต ใช้เวลาประมาณ 1–2 นาที)
 *   โฟลเดอร์แคช: เก็บไฟล์ rounds/<รหัส>.json ที่ดาวน์โหลดแล้ว รันซ้ำจะอ่านจากแคชแทนการดาวน์โหลดใหม่
 * หลักสูตรที่ ทปอ. ยังไม่ประกาศเกณฑ์รอบ 3 จะไม่มีในผลลัพธ์ (build-tcas.ts จะใช้ค่ากลางของสถาบันแทน)
 */
const fs = require('fs'), path = require('path'), https = require('https');
const file = process.argv[2], cacheDir = process.argv[3];
if (!file) { console.error('ระบุไฟล์ .xlsx'); process.exit(1); }
const X = (() => { try { return require('xlsx'); } catch { return require(require.resolve('xlsx', { paths: [path.dirname(path.resolve(file)), process.cwd()] })); } })();
const rows = X.utils.sheet_to_json(X.readFile(file).Sheets.Sheet1, { header: 1, defval: '' }).slice(1);
const ids = [...new Set(rows.filter((r) => Number(r[12]) > 0).map((r) => String(r[2]).trim()).filter(Boolean))];
const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false, maxSockets: 16 });
const get = (id) => new Promise((res) => {
  const f = cacheDir && path.join(cacheDir, `${id}.json`);
  if (f && fs.existsSync(f) && fs.statSync(f).size > 2) return res(fs.readFileSync(f, 'utf8'));
  https.get(`https://my-tcas.s3.ap-southeast-1.amazonaws.com/mytcas/rounds/${id}.json`, { agent, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
    let b = ''; r.setEncoding('utf8'); r.on('data', (d) => (b += d)); r.on('end', () => { if (f && r.statusCode === 200) fs.writeFileSync(f, b); res(r.statusCode === 200 ? b : ''); });
  }).on('error', () => res('')).setTimeout(30000, function () { this.destroy(); });
});

/**
 * รหัสวิชาของ mytcas → รหัสวิชาที่ระบบใช้ (ดู server/src/subjects.ts)
 *   ส่วนย่อยของ TGAT/TPAT1/TPAT2 รวมเป็นวิชาหลัก, GPA รายกลุ่มสาระนับเป็น GPAX, ภาษาต่างประเทศอื่น (83–89) รวมเป็นช่องเดียว
 */
function canon(k) {
  if (k === 'gpax' || /^gpa2\d$/.test(k)) return 'gpax';
  if (/^tgat\d?$/.test(k)) return 'tgat';
  if (/^tpat1\d?$/.test(k)) return 'tpat1';
  if (/^tpat2\d?$/.test(k)) return 'tpat2';
  if (/^tpat[345]$/.test(k)) return k;
  const m = k.match(/^a_lv_(\d\d)$/);
  if (m) return ['61', '62', '63', '64', '65', '66', '70', '81', '82'].includes(m[1]) ? 'a' + m[1] : /^8[3-9]$/.test(m[1]) ? 'alang' : null;
  return null;
}
function weights(x) {
  if (x.cal_type) return null;                          // สูตรพิเศษ เช่น เลือกวิชาที่ได้คะแนนดีที่สุด
  const w = {}; let tot = 0;
  for (const [k, v] of Object.entries(x.scores)) {
    const n = Number(v);
    if (!(n > 0)) continue;
    const c = canon(k);
    if (!c) return null;                                // มีองค์ประกอบที่ระบบไม่รู้จัก (เช่น V-NET) จึงไม่ใช้สูตรนี้
    w[c] = (w[c] || 0) + n; tot += n;
  }
  if (!tot) return null;
  for (const k of Object.keys(w)) w[k] = Math.round((w[k] / tot) * 1000) / 10;
  return w;
}

(async () => {
  const out = {}; let i = 0, withW = 0;
  const work = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      let j = []; try { j = JSON.parse(await get(id)); } catch { /* ไม่มีข้อมูล */ }
      const r3 = j.filter((x) => /^3_/.test(x.type) && x.scores && Object.keys(x.scores).length);
      if (r3.length) out[id] = r3.map((x) => {
        const tot = Object.values(x.scores).reduce((a, v) => a + (Number(v) || 0), 0);
        const w = weights(x); if (w) withW++;
        return { project: x.project_id || '', year: x.type.slice(2), gpax: tot ? Math.round((Number(x.scores.gpax) || 0) / tot * 100) : 0, minGpax: Number(x.min_gpax) || 0, w };
      });
      if (i % 400 === 0) console.log(`${i} / ${ids.length}`);
    }
  };
  await Promise.all(Array.from({ length: 16 }, work));
  fs.writeFileSync(path.join(__dirname, 'tcas-criteria.json'), JSON.stringify(out));
  console.log(`หลักสูตรในไฟล์ ${ids.length} | มีเกณฑ์รอบ 3: ${Object.keys(out).length} (มีสูตรรายวิชา ${withW} รายการ) → เขียน db/tools/tcas-criteria.json แล้ว`);
})();
