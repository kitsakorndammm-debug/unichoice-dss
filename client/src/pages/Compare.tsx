import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { evalSession } from '../lib/session';
import { Link } from '../lib/router';
import { baht, RISK, SERIES, uniLabel } from '../lib/format';
import type { EvalResult, Ranked } from '../lib/types';
import { Button, Card, Empty, Loading, PageHeader, cx } from '../components/ui';
import { Radar } from '../components/charts';

type Row = { label: string; get: (r: Ranked) => number; fmt: (v: number) => string; best: 'max' | 'min' };
const ROWS: Row[] = [
  { label: 'คะแนน SAW', get: (r) => r.score, fmt: (v) => v.toFixed(2), best: 'max' },
  { label: 'อันดับในระบบ', get: (r) => r.rank, fmt: (v) => `#${v}`, best: 'min' },
  { label: 'ค่าเทอมต่อเทอม (บาท)', get: (r) => r.program.tuition_fee, fmt: baht, best: 'min' },
  { label: 'ค่าเล่าเรียนต่อปี (บาท)', get: (r) => r.program.yearly_cost, fmt: baht, best: 'min' },
  { label: 'อันดับมหาวิทยาลัย (THE 2026)', get: (r) => r.program.ranking, fmt: (v) => `#${v}`, best: 'min' },
  { label: 'ระยะทางจากบ้าน (กม.)', get: (r) => r.distanceKm ?? NaN, fmt: (v) => (Number.isNaN(v) ? 'ยังไม่ระบุจังหวัด' : baht(v)), best: 'min' },
  { label: 'โอกาสสอบติด', get: (r) => r.admissionChance, fmt: (v) => `${v}%`, best: 'max' },
  { label: 'คะแนนต่ำสุดที่ติดปีก่อน', get: (r) => r.program.min_score, fmt: (v) => String(v), best: 'min' },
  { label: 'คะแนนสูงสุดที่ติดปีก่อน', get: (r) => r.program.max_score ?? NaN, fmt: (v) => (Number.isNaN(v) ? 'ไม่มีสถิติ' : String(v)), best: 'min' },
  { label: 'จำนวนรับ (คน)', get: (r) => r.program.capacity, fmt: (v) => String(v), best: 'max' },
  { label: 'ผู้สมัครรอบ 3 (คน)', get: (r) => r.program.applicants ?? NaN, fmt: (v) => (Number.isNaN(v) ? 'ไม่มีสถิติ' : baht(v)), best: 'min' },
];

export default function Compare() {
  const { compare, toggleCompare, clearCompare } = useStore();
  const [res, setRes] = useState<EvalResult | null>(null);
  const [scope, setScope] = useState('');

  // ใช้น้ำหนัก/ข้อมูล/ตัวกรองชุดเดียวกับหน้าวิเคราะห์ คะแนนจึงตรงกัน
  // ถ้าหลักสูตรที่เลือกบางตัวถูกตัวกรองคัดออก (เช่น คนละสาขา หรือเกินงบ) จะเทียบกับทุกหลักสูตรในระบบแทน
  useEffect(() => {
    if (compare.length === 0) return;
    let live = true;
    (async () => {
      const ses = evalSession.get();
      const base = ses ? { weights: ses.weights, profile: ses.profile } : {};
      if (ses && Math.round(ses.weights.reduce((s, w) => s + w.value, 0)) > 0) {
        const r = await api<EvalResult>('/evaluate', { body: { ...base, options: { ...ses.options, sensitivity: false } } });
        if (compare.every((id) => r.results.some((x) => x.program.program_id === id))) {
          if (live) { setRes(r); setScope(`เทียบกับ ${r.results.length} หลักสูตรที่ผ่านตัวกรองในหน้าวิเคราะห์`); }
          return;
        }
      }
      const r = await api<EvalResult>('/evaluate', { body: { ...base, options: { sensitivity: false } } });
      if (live) { setRes(r); setScope(`เทียบกับทุกหลักสูตรในระบบ (${r.results.length}) เพราะที่เลือกไว้อยู่นอกตัวกรองของหน้าวิเคราะห์ คะแนนจึงอาจต่างจากหน้าวิเคราะห์`); }
    })().catch(() => { /* api แสดงข้อผิดพลาดเอง */ });
    return () => { live = false; };
  }, [compare.join(',')]);

  if (compare.length === 0) return (
    <>
      <PageHeader title="เปรียบเทียบหลักสูตร" />
      <Card><Empty title="ยังไม่ได้เลือกหลักสูตร" icon="⇆">กด “+ เทียบ” ที่หน้าวิเคราะห์หรือหน้าค้นหาหลักสูตร (สูงสุด 4 หลักสูตร)
        <div className="mt-4 flex justify-center gap-2"><Link to="/analyze"><Button size="sm">ไปหน้าวิเคราะห์</Button></Link><Link to="/programs"><Button size="sm" variant="secondary">ค้นหาหลักสูตร</Button></Link></div></Empty></Card>
    </>
  );
  if (!res) return <Loading />;
  const items = compare.map((id) => res.results.find((r) => r.program.program_id === id)).filter(Boolean) as Ranked[];
  const winner = [...items].sort((a, b) => b.score - a.score)[0];

  return (
    <>
      <PageHeader title="เปรียบเทียบหลักสูตรแบบคู่ขนาน" sub={`${scope} · ช่องสีเขียว = ดีที่สุดในแถว`}
        action={<Button variant="ghost" onClick={clearCompare}>ล้างทั้งหมด</Button>} />

      {winner && items.length > 1 && items.every((r) => r.score === winner.score) && (
        <div className="mb-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
          ▲ หลักสูตรที่เลือกได้คะแนนเท่ากันทุกตัว ({winner.score.toFixed(2)}) ระบบแยกไม่ได้จากเกณฑ์ที่มี ควรเลือกจากเนื้อหาหลักสูตรที่ตรงความสนใจ
        </div>
      )}
      {winner && items.length > 1 && !items.every((r) => r.score === winner.score) && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-brand-600 px-5 py-4 text-white">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-lg">★</div>
          <div className="text-sm"><div className="text-white/70">เหมาะกับคุณที่สุดจากที่เลือก</div><div className="text-base font-semibold">{winner.program.program_name} · {winner.program.uni_name} ({winner.score.toFixed(2)} คะแนน)</div></div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="min-w-0">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="w-44 px-5 py-3 text-left text-xs font-medium text-muted">รายการ</th>
                  {items.map((r, i) => (
                    <th key={r.program.program_id} className="px-3 py-3 text-left align-top font-normal">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="mb-1 inline-block h-1.5 w-8 rounded-full" style={{ background: SERIES[i] }} />
                          <Link to={`/programs/${r.program.program_id}`} className="block font-semibold text-ink hover:text-brand-700">{r.program.program_name}</Link>
                          <div className="text-xs text-muted">{r.program.uni_name}</div>
                        </div>
                        <button onClick={() => toggleCompare(r.program.program_id)} className="rounded p-0.5 text-muted hover:bg-black/5 hover:text-ink" aria-label="นำออก">✕</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const vals = items.map(row.get);
                  // ทุกตัวเท่ากัน = ไม่มีตัวไหน "ดีที่สุด" จึงไม่ไฮไลต์
                  const best = vals.every((v) => v === vals[0]) ? NaN : row.best === 'max' ? Math.max(...vals) : Math.min(...vals);
                  return (
                    <tr key={row.label} className="border-b border-line/60 last:border-0">
                      <td className="px-5 py-2.5 text-ink-2">{row.label}</td>
                      {items.map((r, i) => (
                        <td key={r.program.program_id} className="px-3 py-2.5">
                          <span className={cx('num rounded-md px-1.5 py-0.5', items.length > 1 && vals[i] === best && 'bg-emerald-50 font-semibold text-emerald-800')}>{row.fmt(vals[i])}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="border-b border-line/60">
                  <td className="px-5 py-2.5 text-ink-2">ที่มาเกณฑ์รับ</td>
                  {items.map((r) => <td key={r.program.program_id} className="px-3 py-2.5 text-xs text-ink-2">{r.program.score_source ? `สถิติจริง ${r.program.score_source}` : 'ค่าประมาณ (ไม่มีสถิติ)'}</td>)}
                </tr>
                <tr>
                  <td className="px-5 py-2.5 text-ink-2">ความเสี่ยง</td>
                  {items.map((r) => <td key={r.program.program_id} className="px-3 py-2.5"><span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset', RISK[r.risk].cls)}><span style={{ color: RISK[r.risk].dot }}>{RISK[r.risk].icon}</span>{RISK[r.risk].text}</span></td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="คะแนนรายเกณฑ์ (Normalized)" sub="พื้นที่กว้าง = ดีในหลายด้าน">
          {items[0] && <Radar axes={items[0].details.map((d) => d.name)} series={items.map((r, i) => ({ name: uniLabel(r.program) + ' ' + r.program.program_name.replace(/^(วท|วศ)\.บ\.\s*/, '').slice(0, 14), color: SERIES[i], values: r.details.map((d) => d.normalized) }))} />}
        </Card>
      </div>
    </>
  );
}
