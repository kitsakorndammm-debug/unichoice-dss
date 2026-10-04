/**
 * ดาวน์โหลดเกณฑ์คัดเลือกรอบ 3 รายหลักสูตรจาก mytcas แล้วสรุปเป็น tcas-criteria.json
 *   { รหัสหลักสูตร: [{ project: รหัสโครงการ, year: ปีการศึกษาของประกาศ, gpax: สัดส่วนน้ำหนัก GPAX ในคะแนนรวม (%), minGpax: GPAX ขั้นต่ำ }] }
 * ใช้: node db/tools/fetch-criteria.cjs <ไฟล์สถิติ.xlsx>     (ต้องมีแพ็กเกจ xlsx และต่ออินเทอร์เน็ต ใช้เวลาประมาณ 1–2 นาที)
 * หลักสูตรที่ ทปอ. ยังไม่ประกาศเกณฑ์รอบ 3 จะไม่มีในผลลัพธ์ (build-tcas.ts จะใช้ค่ากลางของสถาบันแทน)
 */
const fs = require('fs'), path = require('path'), https = require('https');
const file = process.argv[2];
if (!file) { console.error('ระบุไฟล์ .xlsx'); process.exit(1); }
const X = (() => { try { return require('xlsx'); } catch { return require(require.resolve('xlsx', { paths: [path.dirname(path.resolve(file)), process.cwd()] })); } })();
const rows = X.utils.sheet_to_json(X.readFile(file).Sheets.Sheet1, { header: 1, defval: '' }).slice(1);
const ids = [...new Set(rows.filter((r) => Number(r[12]) > 0).map((r) => String(r[2]).trim()).filter(Boolean))];
const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false, maxSockets: 16 });
const get = (id) => new Promise((res) => {
  https.get(`https://my-tcas.s3.ap-southeast-1.amazonaws.com/mytcas/rounds/${id}.json`, { agent, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
    let b = ''; r.setEncoding('utf8'); r.on('data', (d) => (b += d)); r.on('end', () => res(r.statusCode === 200 ? b : ''));
  }).on('error', () => res('')).setTimeout(30000, function () { this.destroy(); });
});
(async () => {
  const out = {}; let i = 0;
  const work = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      let j = []; try { j = JSON.parse(await get(id)); } catch { /* ไม่มีข้อมูล */ }
      const r3 = j.filter((x) => /^3_/.test(x.type) && x.scores && Object.keys(x.scores).length);
      if (r3.length) out[id] = r3.map((x) => {
        const tot = Object.values(x.scores).reduce((a, v) => a + (Number(v) || 0), 0);
        return { project: x.project_id || '', year: x.type.slice(2), gpax: tot ? Math.round((Number(x.scores.gpax) || 0) / tot * 100) : 0, minGpax: Number(x.min_gpax) || 0 };
      });
      if (i % 400 === 0) console.log(`${i} / ${ids.length}`);
    }
  };
  await Promise.all(Array.from({ length: 16 }, work));
  fs.writeFileSync(path.join(__dirname, 'tcas-criteria.json'), JSON.stringify(out));
  console.log(`หลักสูตรในไฟล์ ${ids.length} | มีเกณฑ์รอบ 3: ${Object.keys(out).length} → เขียน db/tools/tcas-criteria.json แล้ว`);
})();
