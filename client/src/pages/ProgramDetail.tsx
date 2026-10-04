import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore, MAX_COMPARE } from '../lib/store';
import { Link } from '../lib/router';
import { baht, colorFor, FLAG_TEXT, RISK, mapUrl } from '../lib/format';
import type { EvalResult, Program, Ranked } from '../lib/types';
import { evalSession } from '../lib/session';
import { Badge, Button, Card, Empty, Loading, cx, useToast } from '../components/ui';
import { Gauge, Radar, StackedBars } from '../components/charts';

interface Detail { program: Program; evaluation: Ranked | null; totalPrograms: number; saved: boolean; others: Program[] }

export default function ProgramDetail({ id }: { id: number }) {
  const toast = useToast();
  const { compare, toggleCompare } = useStore();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  const [scope, setScope] = useState('ในกลุ่มสาขาเดียวกัน ตามโปรไฟล์และน้ำหนักที่บันทึกไว้');

  useEffect(() => {
    setD(null);
    let live = true;
    (async () => {
      const det = await api<Detail>(`/programs/${id}`);
      // มีค่าที่ปรับค้างไว้ในหน้าวิเคราะห์ → คำนวณด้วยค่าชุดเดียวกัน คะแนนและอันดับจึงตรงกับหน้าวิเคราะห์
      const ses = evalSession.get();
      if (ses && Math.round(ses.weights.reduce((s, w) => s + w.value, 0)) > 0) {
        const pick = (r: EvalResult) => r.results.find((x) => x.program.program_id === id);
        let r = await api<EvalResult>('/evaluate', { body: { weights: ses.weights, profile: ses.profile, options: { ...ses.options, sensitivity: false } } });
        let label = 'เทียบกับหลักสูตรที่ผ่านตัวกรองในหน้าวิเคราะห์';
        if (!pick(r)) {
          r = await api<EvalResult>('/evaluate', { body: { weights: ses.weights, profile: { ...ses.profile, interest_field: det.program.field }, options: { matchField: true, sensitivity: false } } });
          label = 'เทียบกับทุกหลักสูตรในกลุ่มสาขาเดียวกัน (หลักสูตรนี้อยู่นอกตัวกรองของหน้าวิเคราะห์)';
        }
        const ev = pick(r);
        if (ev && live) { setD({ ...det, evaluation: ev, totalPrograms: r.results.length }); setScope(label); return; }
      }
      if (live) setD(det);
    })().catch((e) => setErr(e.message));
    return () => { live = false; };
  }, [id]);

  if (err) return <Card><Empty title="ไม่พบหลักสูตร">{err}</Empty></Card>;
  if (!d) return <Loading />;
  const { program: p, evaluation: ev } = d;
  const inC = compare.includes(p.program_id);

  async function toggleSave() {
    try {
      if (d!.saved) await api(`/saved-list/${p.program_id}`, { method: 'DELETE' });
      else await api('/saved-list', { body: { programId: p.program_id } });
      setD({ ...d!, saved: !d!.saved });
      toast(d!.saved ? 'นำออกจากรายการโปรดแล้ว' : 'บันทึกเป็นรายการโปรดแล้ว');
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  const facts: [string, string][] = [
    ['ค่าเทอมต่อเทอม', `${baht(p.tuition_fee)} บาท`], ['ค่าเล่าเรียนเฉลี่ยต่อปี', `${baht(p.yearly_cost)} บาท`], ['อันดับมหาวิทยาลัยในไทย', `#${p.ranking}`],
    ['ระยะทางจากบ้าน (เส้นตรง)', ev?.distanceKm != null ? `ราว ${baht(ev.distanceKm)} กม.` : 'ยังไม่ระบุที่อยู่'],
    ...(p.score_source
      ? [[`คะแนนต่ำสุด–สูงสุดที่ติด (${p.score_source})`, `${p.min_score} – ${p.max_score}`], ['จำนวนรับ / ผู้สมัคร (รอบ 3)', `${baht(p.capacity)} / ${baht(p.applicants)} คน`],
        ['คะแนนที่ใช้คัดเลือก', `GPAX ${Math.round((p.gpax_weight ?? 0) * 100)}% · คะแนนสอบ ${100 - Math.round((p.gpax_weight ?? 0) * 100)}%`],
        ['GPAX ขั้นต่ำ', p.min_gpa > 0 ? p.min_gpa.toFixed(2) : 'ไม่กำหนด']] as [string, string][]
      : [['GPA ขั้นต่ำ (ประมาณ)', p.min_gpa.toFixed(2)], ['คะแนนสอบขั้นต่ำ (ประมาณ)', `${p.min_score}%`], ['จำนวนรับ (ประมาณ)', `${p.capacity} คน`]] as [string, string][]),
    ['ที่ตั้ง', `${p.province ?? ''} (${p.region})`],
  ];
  const risk = ev ? RISK[ev.risk] : null;

  return (
    <>
      <Link to="/programs" className="inline-flex min-h-10 items-center text-sm text-ink-2 hover:text-ink sm:min-h-0">← กลับไปหน้าค้นหา</Link>
      <div className="mt-3 mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-1.5"><Badge tone="brand">{p.field}</Badge><Badge>{p.uni_type}</Badge><Badge>{p.degree}</Badge></div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{p.program_name}</h1>
          <div className="text-ink-2">{p.uni_name} · {p.faculty}</div>
          <div className="flex flex-wrap gap-x-4 text-sm">
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="inline-block py-1.5 text-brand-600 hover:underline sm:py-0">{p.website.replace(/^https?:\/\//, '')} ↗</a>}
            <a href={mapUrl(p, evalSession.get()?.profile)} target="_blank" rel="noreferrer" className="inline-block py-1.5 text-brand-600 hover:underline sm:py-0">ดูที่ตั้งและเส้นทางใน Google Maps ↗</a>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant={d.saved ? 'primary' : 'secondary'} onClick={toggleSave}>{d.saved ? '♥ อยู่ในรายการโปรด' : '♡ บันทึกเป็นรายการโปรด'}</Button>
          <Button variant={inC ? 'primary' : 'secondary'} disabled={!inC && compare.length >= MAX_COMPARE} onClick={() => toggleCompare(p.program_id)}>{inC ? '✓ อยู่ในรายการเทียบ' : '+ เพิ่มเพื่อเปรียบเทียบ'}</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="คะแนนตามน้ำหนักของคุณ" sub={scope}>
          {ev ? (
            <div className="text-center">
              <div className="text-5xl font-semibold tracking-tight text-ink">{ev.score.toFixed(1)}</div>
              <div className="mt-1 text-sm text-ink-2">อันดับ <b className="text-ink">{ev.rank}</b> จาก {d.totalPrograms} หลักสูตร</div>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {ev.strengths.map((s) => <Badge key={s} tone="green">+ {s}</Badge>)}
                {ev.weaknesses.map((s) => <Badge key={s} tone="amber">− {s}</Badge>)}
              </div>
            </div>
          ) : <Empty title="ยังคำนวณไม่ได้">ตั้งค่าน้ำหนักในหน้าวิเคราะห์ก่อน</Empty>}
        </Card>
        <Card title="โอกาสสอบติด" sub={p.score_source ? `เทียบคะแนนสอบของคุณกับคะแนนต่ำสุด–สูงสุดของผู้ที่สอบติดจริงใน ${p.score_source}` : 'ค่าประมาณ: หลักสูตรนี้ไม่มีในสถิติรอบ 3 ของ ทปอ. จึงเทียบกับเกณฑ์ขั้นต่ำโดยประมาณ'}>
          {ev && risk ? (
            <div className="flex flex-col items-center">
              <Gauge value={ev.admissionChance} label="ความน่าจะเป็นโดยประมาณ" color={risk.dot} />
              <span className={cx('mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset', risk.cls)}><span style={{ color: risk.dot }}>{risk.icon}</span>{risk.text}</span>
              <div className="mt-3 flex flex-wrap justify-center gap-1">{ev.flags.map((f) => <Badge key={f} tone="red">{FLAG_TEXT[f]}</Badge>)}</div>
            </div>
          ) : <Empty title="-" />}
        </Card>
        <Card title="ข้อมูลหลักสูตร">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="num font-medium">{v}</dd></div>)}
          </dl>
          {p.description && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{p.description}</p>}
        </Card>
      </div>

      {ev && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card title="คะแนนรายเกณฑ์ (Normalized 0–1)" sub="ยิ่งใกล้ขอบนอก = ดีที่สุดในกลุ่มที่เทียบ">
            <Radar axes={ev.details.map((x) => x.name)} series={[{ name: p.short_name || p.uni_name, color: '#2a78d6', values: ev.details.map((x) => x.normalized) }]} />
          </Card>
          <Card title="ที่มาของคะแนน SAW" sub="ค่าดิบ → Normalize → × น้ำหนัก">
            <StackedBars rows={[{ id: 1, label: 'คะแนนรวม', total: ev.score, segments: ev.details.map((x) => ({ key: x.code, label: x.name, value: x.weighted * 100, color: colorFor(x.code) })) }]} />
            <table className="mt-5 w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1.5 font-medium">เกณฑ์</th><th className="py-1.5 text-right font-medium">ค่าดิบ</th><th className="py-1.5 text-right font-medium">Normalized</th><th className="py-1.5 text-right font-medium">น้ำหนัก</th><th className="py-1.5 text-right font-medium">คะแนน</th></tr></thead>
              <tbody className="num">
                {ev.details.map((x) => (
                  <tr key={x.code} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5"><span className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ background: colorFor(x.code) }} />{x.name} <span className="text-[11px] text-muted">{x.type}</span></td>
                    <td className="py-1.5 text-right">{baht(x.raw)}</td><td className="py-1.5 text-right">{x.normalized.toFixed(3)}</td>
                    <td className="py-1.5 text-right">{(x.weight * 100).toFixed(0)}%</td><td className="py-1.5 text-right font-medium">{(x.weighted * 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {d.others.length > 0 && (
        <Card className="mt-5" title={`หลักสูตรอื่นใน${p.uni_name}`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d.others.map((o) => (
              <Link key={o.program_id} to={`/programs/${o.program_id}`} className="rounded-lg bg-stone-50 px-3 py-2 transition hover:bg-brand-50">
                <div className="text-sm font-medium">{o.program_name}</div><div className="text-xs text-muted">{o.faculty} · {baht(o.tuition_fee)} บาท/เทอม</div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
