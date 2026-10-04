import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Link } from '../../lib/router';
import { colorFor, fmtDate, RISK, SERIES } from '../../lib/format';
import { Card, Loading, PageHeader, Stat, Badge } from '../../components/ui';
import { AreaLine, BarList, Donut } from '../../components/charts';

interface Stats {
  counts: { students: number; universities: number; programs: number; runs: number; runs_7d: number; saved: number; avg_stability: number | null };
  runsPerDay: { day: string; runs: number }[];
  topRecommended: { program_id: number; program_name: string; short_name: string; times: number }[];
  avgWeights: { name: string; weight: number }[];
  regionDemand: { name: string; value: number }[];
  fieldInterest: { name: string; value: number }[];
  riskMix: { name: 'low' | 'medium' | 'high'; value: number }[];
  recentRuns: { run_id: number; run_date: string; name: string; stability: number | null; top_program: string | null }[];
  cacheBackend: string;
}
const NAME_TO_CODE: Record<string, string> = { 'ค่าเล่าเรียนต่อปี': 'tuition', 'โอกาสสอบติด': 'admission', 'อันดับมหาวิทยาลัย': 'ranking', 'ความใกล้บ้าน': 'location' };

export default function AdminDashboard() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    const load = () => api<Stats>('/admin/stats').then(setS);
    load();
    const t = setInterval(load, 15000); // รีเฟรชอัตโนมัติทุก 15 วินาที
    return () => clearInterval(t);
  }, []);
  if (!s) return <Loading />;
  const c = s.counts;
  const riskOrder = ['low', 'medium', 'high'] as const;

  return (
    <>
      <PageHeader title="แดชบอร์ดผู้ดูแลระบบ" sub="ภาพรวมการใช้งานระบบและพฤติกรรมการตัดสินใจของนักเรียน (อัปเดตอัตโนมัติทุก 15 วินาที)" action={<Badge tone="green">● cache: {s.cacheBackend}</Badge>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="นักเรียน" value={c.students} />
        <Stat label="มหาวิทยาลัย" value={c.universities} />
        <Stat label="หลักสูตร" value={c.programs} />
        <Stat label="การประเมินทั้งหมด" value={c.runs} sub={`7 วันล่าสุด ${c.runs_7d} รอบ`} />
        <Stat label="รายการโปรด" value={c.saved} />
        <Stat label="ความเสถียรเฉลี่ย" value={c.avg_stability != null ? `${c.avg_stability}%` : '-'} sub="ของคำแนะนำอันดับ 1" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="จำนวนการประเมินรายวัน" sub="14 วันล่าสุด">
          <AreaLine data={s.runsPerDay.map((d) => ({ x: d.day, y: d.runs }))} label="การประเมิน" />
        </Card>
        <Card title="ระดับความเสี่ยงของหลักสูตรที่ติด Top 3" sub="จากโอกาสสอบติด">
          <Donut data={riskOrder.map((k) => ({ label: `${RISK[k].icon} ${RISK[k].text}`, value: s.riskMix.find((r) => r.name === k)?.value ?? 0, color: RISK[k].dot }))}
            center={<div><div className="text-xl font-semibold">{s.riskMix.reduce((a, b) => a + b.value, 0)}</div><div className="text-[11px] text-muted">รายการ</div></div>} />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="หลักสูตรที่ถูกแนะนำเป็นอันดับ 1 บ่อยที่สุด">
          <BarList items={s.topRecommended.map((t) => ({ label: t.program_name, sub: t.short_name, value: t.times }))} format={(v) => `${v} ครั้ง`} />
        </Card>
        <Card title="น้ำหนักเฉลี่ยที่นักเรียนให้แต่ละเกณฑ์" sub="สะท้อนว่านักเรียนให้ความสำคัญกับอะไร">
          <div className="space-y-2.5">
            {s.avgWeights.map((w) => (
              <div key={w.name}>
                <div className="mb-1 flex justify-between text-[13px]"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: colorFor(NAME_TO_CODE[w.name] ?? '') }} />{w.name}</span><span className="num text-ink-2">{w.weight}%</span></div>
                <div className="h-2 rounded-full bg-stone-100"><div className="h-2 rounded-r-[4px] rounded-l-full" style={{ width: `${(w.weight / Math.max(...s.avgWeights.map((x) => x.weight), 1)) * 100}%`, background: colorFor(NAME_TO_CODE[w.name] ?? '') }} /></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="ความต้องการของนักเรียน">
          <div className="text-xs font-medium text-ink-2">ภูมิภาคที่สนใจ</div>
          <div className="mt-2"><BarList items={s.regionDemand.map((r) => ({ label: r.name, value: r.value }))} color={SERIES[0]} format={(v) => `${v} คน`} /></div>
          <div className="mt-5 text-xs font-medium text-ink-2">สาขาที่สนใจ</div>
          <div className="mt-2"><BarList items={s.fieldInterest.map((r) => ({ label: r.name, value: r.value }))} color={SERIES[0]} format={(v) => `${v} คน`} /></div>
        </Card>
      </div>

      <Card className="mt-5" title="การประเมินล่าสุด">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-5 py-2 font-medium">รอบ</th><th className="py-2 font-medium">เวลา</th><th className="py-2 font-medium">นักเรียน</th><th className="py-2 font-medium">หลักสูตรอันดับ 1</th><th className="px-5 py-2 text-right font-medium">ความเสถียร</th></tr></thead>
            <tbody>
              {s.recentRuns.map((r) => (
                <tr key={r.run_id} className="border-b border-line/60 last:border-0 hover:bg-stone-50">
                  <td className="px-5 py-2"><Link to={`/history/${r.run_id}`} className="text-brand-600 hover:underline">#{r.run_id}</Link></td>
                  <td className="py-2 text-ink-2">{fmtDate(r.run_date)}</td><td className="py-2">{r.name}</td><td className="py-2">{r.top_program ?? '-'}</td>
                  <td className="num px-5 py-2 text-right">{r.stability != null ? `${r.stability}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
