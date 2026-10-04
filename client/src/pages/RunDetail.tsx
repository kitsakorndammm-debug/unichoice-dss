import { useEffect, useState } from 'react';
import { api, reportUrl } from '../lib/api';
import { Link } from '../lib/router';
import { baht, colorFor, fmtDate, RISK } from '../lib/format';
import { Button, Card, Empty, Loading, PageHeader, Stat, cx } from '../components/ui';
import { Legend, StackedBars } from '../components/charts';
import { useStore } from '../lib/store';

export default function RunDetail({ id }: { id: number }) {
  const { user } = useStore();
  const [d, setD] = useState<{ run: any; results: any[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/evaluations/${id}`).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <Card><Empty title="ไม่พบผลการประเมิน">{err}</Empty></Card>;
  if (!d) return <Loading />;
  const { run, results } = d;
  const p = run.profile_snapshot ?? {};
  const weights: { code: string; name: string; weight: number }[] = run.weights_snapshot;

  return (
    <>
      <Link to={user?.role === 'admin' ? '/admin' : '/history'} className="text-sm text-ink-2 hover:text-ink">← กลับ</Link>
      <PageHeader title={`ผลการประเมินรอบที่ #${run.run_id}`} sub={`${fmtDate(run.run_date)} · ${run.user_name} · ข้อมูลจากตาราง evaluation_run / evaluation / evaluation_detail`}
        action={<a href={reportUrl(run.run_id)} target="_blank" rel="noreferrer"><Button>เปิดรายงาน / บันทึก PDF</Button></a>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="GPA" value={p.gpa ?? '-'} />
        <Stat label="คะแนนสอบ" value={p.exam_score != null ? `${p.exam_score}%` : '-'} />
        <Stat label="งบ/ปี" value={p.budget ? baht(p.budget) : '-'} />
        <Stat label="ภูมิภาค" value={<span className="text-lg">{p.preferred_region || 'ทั้งหมด'}</span>} />
        <Stat label="ความเสถียร" value={run.stability != null ? `${run.stability}%` : '-'} />
      </div>
      <Card title="ผลการจัดอันดับ 10 อันดับแรก" className="mb-5">
        <div className="mb-4"><Legend items={weights.map((w) => ({ label: `${w.name} ${Math.round(w.weight * 100)}%`, color: colorFor(w.code) }))} /></div>
        <StackedBars rows={results.slice(0, 10).map((r) => ({
          id: r.eval_id, label: `${r.rank}. ${r.program_name}`, sub: r.short_name, total: Number(r.total_score), highlight: r.rank === 1,
          segments: r.details.map((x: any) => ({ key: x.code, label: x.criteria_name, value: Number(x.weighted_score) * 100, color: colorFor(x.code) })),
        }))} />
      </Card>
      <Card title={`ตารางผลทั้งหมด (${results.length})`}>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-5 py-2 font-medium">#</th><th className="py-2 font-medium">หลักสูตร</th><th className="py-2 text-right font-medium">ค่าเทอม</th><th className="py-2 text-right font-medium">โอกาสติด</th><th className="px-5 py-2 text-right font-medium">คะแนน</th></tr></thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.eval_id} className="border-b border-line/60 last:border-0">
                  <td className="num px-5 py-2">{r.rank}</td>
                  <td className="py-2"><div className="font-medium">{r.program_name}</div><div className="text-xs text-muted">{r.uni_name}</div></td>
                  <td className="num py-2 text-right">{baht(r.tuition_fee)}</td>
                  <td className="py-2 text-right"><span className={cx('num rounded-full px-1.5 py-0.5 text-xs ring-1 ring-inset', RISK[r.risk_level as 'low'].cls)}>{Math.round(r.admission_chance)}%</span></td>
                  <td className="num px-5 py-2 text-right font-semibold">{Number(r.total_score).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
