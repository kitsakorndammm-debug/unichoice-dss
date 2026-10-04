import { useEffect, useState } from 'react';
import { api, reportUrl } from '../lib/api';
import { Link } from '../lib/router';
import { fmtDate, colorFor } from '../lib/format';
import { Button, Card, Empty, Loading, PageHeader, useToast } from '../components/ui';

interface Run { run_id: number; run_date: string; stability: number | null; n_programs: number; weights_snapshot: { code: string; name: string; weight: number }[]; profile_snapshot: any; top: { rank: number; total_score: number; program_name: string; short_name: string }[] | null }

export default function History() {
  const toast = useToast();
  const [runs, setRuns] = useState<Run[] | null>(null);
  useEffect(() => { api<{ runs: Run[] }>('/evaluations/history').then((r) => setRuns(r.runs)); }, []);

  async function del(id: number) {
    if (!confirm('ลบผลการประเมินรอบนี้?')) return;
    await api(`/evaluations/${id}`, { method: 'DELETE' });
    setRuns((r) => r!.filter((x) => x.run_id !== id));
    toast('ลบแล้ว');
  }

  return (
    <>
      <PageHeader title="ประวัติการประเมิน" sub="ผลการจัดอันดับที่บันทึกไว้แต่ละรอบ พร้อมน้ำหนักที่ใช้ ณ เวลานั้น" action={<Link to="/analyze"><Button>วิเคราะห์ใหม่</Button></Link>} />
      {!runs ? <Loading /> : runs.length === 0 ? <Card><Empty title="ยังไม่มีประวัติ" icon="⟲">กด “บันทึกผลการประเมิน” ในหน้าวิเคราะห์เพื่อเก็บผลไว้ดูย้อนหลัง</Empty></Card> : (
        <div className="space-y-3">
          {runs.map((r) => (
            <Card key={r.run_id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-muted">รอบที่ #{r.run_id} · {fmtDate(r.run_date)} · {r.n_programs} หลักสูตร{r.stability != null && ` · ความเสถียร ${r.stability}%`}</div>
                  <ol className="mt-2 space-y-1 text-sm">
                    {(r.top ?? []).slice(0, 5).map((t, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="num grid h-5 w-5 place-items-center rounded-full bg-stone-100 text-[11px] font-semibold">{t.rank}</span>
                        <span className="font-medium">{t.program_name}</span><span className="text-muted">{t.short_name}</span>
                        <span className="num text-ink-2">{Number(t.total_score).toFixed(1)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex gap-2">
                  <Link to={`/history/${r.run_id}`}><Button size="sm" variant="secondary">ดูรายละเอียด</Button></Link>
                  <a href={reportUrl(r.run_id)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">รายงาน PDF</Button></a>
                  <Button size="sm" variant="ghost" onClick={() => del(r.run_id)}>ลบ</Button>
                </div>
              </div>
              <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full" title="สัดส่วนน้ำหนักที่ใช้">
                {r.weights_snapshot.filter((w) => w.weight > 0).map((w) => <div key={w.code} style={{ width: `${w.weight * 100}%`, background: colorFor(w.code) }} title={`${w.name} ${Math.round(w.weight * 100)}%`} />)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">{r.weights_snapshot.map((w) => <span key={w.code}>{w.name} {Math.round(w.weight * 100)}%</span>)}</div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
