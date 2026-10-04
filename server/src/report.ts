// รายงานสรุปผล (HTML สำหรับพิมพ์ / บันทึกเป็น PDF ผ่านเบราว์เซอร์ — รองรับภาษาไทยสมบูรณ์)
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const baht = (n: number) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const riskTh: Record<string, string> = { low: 'ความเสี่ยงต่ำ', medium: 'ความเสี่ยงปานกลาง', high: 'ความเสี่ยงสูง' };

export function renderReport({ run, results }: { run: any; results: any[] }): string {
  const p = run.profile_snapshot ?? {};
  const weights: any[] = run.weights_snapshot ?? [];
  const date = new Date(run.run_date).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' });
  const top = results.slice(0, 10);
  const max = Math.max(...top.map((r) => r.total_score), 1);
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานผลการประเมิน #${run.run_id}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box} body{font-family:'Sarabun','Tahoma',sans-serif;color:#1f2937;margin:0;padding:32px;font-size:14px;background:#fff}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:24px 0 8px;border-bottom:2px solid #4f46e5;padding-bottom:4px}
  .muted{color:#6b7280} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .box{border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px} .box b{display:block;font-size:16px}
  table{width:100%;border-collapse:collapse;margin-top:6px} th,td{border-bottom:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-weight:600} td.n{text-align:right;font-variant-numeric:tabular-nums}
  .bar{height:10px;background:#4f46e5;border-radius:4px} .tag{display:inline-block;padding:1px 6px;border-radius:999px;font-size:11px;background:#eef2ff;color:#3730a3;margin-right:4px}
  .r-low{color:#047857}.r-medium{color:#b45309}.r-high{color:#b91c1c}
  .btn{position:fixed;top:16px;right:16px;background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}
  @media print{.btn{display:none} body{padding:0}}
</style></head><body>
<button class="btn" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button>
<h1>รายงานผลการวิเคราะห์การเลือกคณะ/มหาวิทยาลัย</h1>
<div class="muted">ระบบสนับสนุนการตัดสินใจ (DSS) ด้วยวิธี Simple Additive Weighting · รอบที่ #${run.run_id} · ${esc(date)} · ผู้ใช้ ${esc(run.user_name)}</div>

<h2>ข้อมูลผู้สมัคร</h2>
<div class="grid">
  <div class="box"><span class="muted">GPA</span><b>${esc(p.gpa ?? '-')}</b></div>
  <div class="box"><span class="muted">คะแนนสอบ (%)</span><b>${esc(p.exam_score ?? '-')}</b></div>
  <div class="box"><span class="muted">งบค่าเล่าเรียน/ปี</span><b>${p.budget ? baht(p.budget) + ' บาท' : '-'}</b></div>
  <div class="box"><span class="muted">จังหวัดที่อยู่ / ภูมิภาคที่สนใจ</span><b>${esc(p.home_province || 'ไม่ระบุ')} / ${esc(p.preferred_region || 'ทั้งหมด')}</b></div>
  <div class="box"><span class="muted">สาขาที่สนใจ</span><b>${esc(p.interest_field || 'ทั้งหมด')}</b></div>
  <div class="box"><span class="muted">ความเสถียรของผลลัพธ์</span><b>${run.stability != null ? esc(run.stability) + '%' : '-'}</b></div>
</div>

<h2>น้ำหนักเกณฑ์ที่ใช้</h2>
<table><tr>${weights.map((w) => `<th style="text-align:center">${esc(w.name)}</th>`).join('')}</tr><tr>${weights.map((w) => `<td style="text-align:center">${Math.round(w.weight * 100)}%</td>`).join('')}</tr></table>

<h2>ผลการจัดอันดับ (${results.length} หลักสูตร)</h2>
<table>
<tr><th>#</th><th>หลักสูตร</th><th>มหาวิทยาลัย</th><th class="n">ค่าเทอม/เทอม</th><th class="n">โอกาสสอบติด</th><th style="width:22%">คะแนน SAW</th></tr>
${top.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.program_name)}<div class="muted">${esc(r.faculty)}</div></td><td>${esc(r.short_name || r.uni_name)}</td>
<td class="n">${baht(r.tuition_fee)}<div class="muted" style="font-size:11px">${baht(r.yearly_cost)}/ปี</div></td><td class="n r-${esc(r.risk_level)}">${Math.round(r.admission_chance)}%<div style="font-size:11px">${riskTh[r.risk_level] ?? ''}</div></td>
<td><div style="display:flex;gap:6px;align-items:center"><div class="bar" style="width:${(r.total_score / max) * 100}%"></div><b>${Number(r.total_score).toFixed(2)}</b></div></td></tr>`).join('')}
</table>

${top[0] ? `<h2>รายละเอียดคะแนนรายเกณฑ์ของอันดับ 1: ${esc(top[0].program_name)} (${esc(top[0].short_name)})</h2>
<table><tr><th>เกณฑ์</th><th>ประเภท</th><th class="n">ค่าดิบ</th><th class="n">Normalized</th><th class="n">ถ่วงน้ำหนัก</th></tr>
${top[0].details.map((d: any) => `<tr><td>${esc(d.criteria_name)}</td><td>${d.type === 'cost' ? 'Cost (ยิ่งน้อยยิ่งดี)' : 'Benefit (ยิ่งมากยิ่งดี)'}</td><td class="n">${baht(d.raw_value)}</td><td class="n">${Number(d.normalized_score).toFixed(4)}</td><td class="n">${Number(d.weighted_score).toFixed(4)}</td></tr>`).join('')}
</table>` : ''}

<p class="muted" style="margin-top:24px;font-size:12px">หมายเหตุ: คะแนน SAW = Σ (ค่าที่ปรับสเกล × น้ำหนัก) × 100 · Benefit: x / max · Cost: min / x (เกณฑ์อันดับใช้แบบเส้นตรง (max − x) / (max − min)) · เกณฑ์ที่เป็นร้อยละ (โอกาสสอบติด, พื้นที่) ใช้ x / 100 · ค่าเทอมเป็นค่าจริงต่อภาคการศึกษาจากประกาศของมหาวิทยาลัย (คะแนนและงบเทียบเป็นค่าเล่าเรียนต่อปี = ค่าเทอม × จำนวนเทอมต่อปี) อันดับอ้างอิง THE World University Rankings 2026 ส่วนโอกาสสอบติดเป็นค่าประมาณ ควรตรวจสอบกับประกาศรับสมัครจริงอีกครั้ง</p>
<script>if(location.search.includes('print=1'))setTimeout(()=>print(),600)</script>
</body></html>`;
}
