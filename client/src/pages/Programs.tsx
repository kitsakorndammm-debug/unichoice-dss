import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore, MAX_COMPARE } from '../lib/store';
import { Link } from '../lib/router';
import { baht, uniLabel } from '../lib/format';
import type { Meta, Program } from '../lib/types';
import { Badge, Button, Card, Empty, Input, Loading, PageHeader, Select, cx, useToast } from '../components/ui';

export default function Programs() {
  const toast = useToast();
  const { compare, toggleCompare } = useStore();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [list, setList] = useState<Program[] | null>(null);
  const [f, setF] = useState({ q: '', field: 'ทั้งหมด', region: 'ทั้งหมด', type: 'ทั้งหมด', uni: 'ทั้งหมด', maxFee: '', sort: 'ranking' });
  const PAGE = 48; // แสดงทีละส่วน เพราะมีหลักสูตรรวมกว่าพันรายการ
  const [shown, setShown] = useState(PAGE);

  useEffect(() => { api<Meta>('/meta').then(setMeta); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== 'ทั้งหมด'));
      api<{ programs: Program[] }>(`/programs?${qs}`).then((r) => { setList(r.programs); setShown(PAGE); });
    }, 200);
    return () => clearTimeout(t);
  }, [f]);

  async function toggleSave(p: Program) {
    try {
      if (p.saved) await api(`/saved-list/${p.program_id}`, { method: 'DELETE' });
      else await api('/saved-list', { body: { programId: p.program_id } });
      setList((l) => l!.map((x) => (x.program_id === p.program_id ? { ...x, saved: !p.saved } : x)));
      toast(p.saved ? 'นำออกจากรายการโปรดแล้ว' : 'เพิ่มในรายการโปรดแล้ว');
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  return (
    <>
      <PageHeader title="ค้นหาและกรองหลักสูตร" sub={`ทุกกลุ่มคณะจาก ${meta?.universities.length ?? ''} มหาวิทยาลัย/วิทยาเขต · ชื่อหลักสูตรและเกณฑ์รับจากสถิติ ทปอ. · ค่าเทอมเป็นอัตราต่อ 1 เทอม`} action={compare.length > 0 && <Link to="/compare"><Button>เปรียบเทียบ ({compare.length})</Button></Link>} />
      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <Input className="lg:col-span-2" placeholder="ค้นหาชื่อหลักสูตร มหาวิทยาลัย หรือคณะ..." value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <Select value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}><option value="ทั้งหมด">ทุกสาขา</option>{meta?.fields.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select value={f.uni} onChange={(e) => setF({ ...f, uni: e.target.value })}><option value="ทั้งหมด">ทุกมหาวิทยาลัย</option>{meta?.universities.map((x) => <option key={x.uni_id} value={x.uni_id}>{x.short_name || x.uni_name}</option>)}</Select>
          <Select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}><option value="ทั้งหมด">ทุกภูมิภาค</option>{meta?.regions.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="ทั้งหมด">รัฐ/เอกชน</option><option>รัฐ</option><option>เอกชน</option></Select>
          <Select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
            <option value="ranking">เรียงตามอันดับมหาวิทยาลัย</option><option value="fee">ค่าเทอมต่ำสุด</option><option value="feeDesc">ค่าเทอมสูงสุด</option><option value="name">ชื่อมหาวิทยาลัย</option>
          </Select>
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm text-ink-2">
          <span className="whitespace-nowrap">ค่าเทอมไม่เกิน</span>
          <input type="range" min={10000} max={100000} step={1000} value={f.maxFee || 100000} onChange={(e) => setF({ ...f, maxFee: e.target.value === '100000' ? '' : e.target.value })} className="slider w-56" style={{ ['--p' as string]: `${(((Number(f.maxFee) || 100000) - 10000) / 90000) * 100}%` }} />
          <span className="num whitespace-nowrap font-medium text-ink">{f.maxFee ? `${baht(Number(f.maxFee))} บาท/เทอม` : 'ไม่จำกัด'}</span>
        </div>
      </Card>

      {!list ? <Loading /> : list.length === 0 ? <Card><Empty title="ไม่พบหลักสูตรที่ตรงเงื่อนไข" /></Card> : (
        <>
          <div className="mb-3 text-sm text-muted">พบ {baht(list.length)} หลักสูตร{list.length > shown && ` · แสดง ${shown} รายการแรก`}</div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {list.slice(0, shown).map((p) => {
              const inC = compare.includes(p.program_id);
              return (
                <div key={p.program_id} className="fade-up flex flex-col rounded-2xl bg-white p-5 ring-1 ring-black/[0.07] transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5"><Badge tone="brand">{p.field}</Badge><Badge>{p.uni_type}</Badge><Badge>{p.region}</Badge></div>
                      <Link to={`/programs/${p.program_id}`} className="mt-2 block font-semibold leading-snug text-ink hover:text-brand-700">{p.program_name}</Link>
                      <div className="text-sm text-ink-2">{p.uni_name}</div>
                      <div className="text-xs text-muted">{p.faculty}{p.distanceKm != null && ` · ห่างบ้านราว ${baht(p.distanceKm)} กม.`}</div>
                    </div>
                    <div className="shrink-0 text-right"><div className="text-[11px] text-muted">อันดับ ม.</div><div className="num text-xl font-semibold">#{p.ranking}</div></div>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3 text-center">
                    <div><dt className="text-[11px] text-muted">ค่าเทอม/เทอม</dt><dd className="num text-sm font-semibold">{baht(p.tuition_fee)}</dd></div>
                    {p.score_source ? <>
                      <div><dt className="text-[11px] text-muted">คะแนนต่ำสุดที่ติด</dt><dd className="num text-sm font-semibold">{p.min_score}</dd></div>
                      <div><dt className="text-[11px] text-muted">รับ / สมัคร</dt><dd className="num text-sm font-semibold">{baht(p.capacity)} / {baht(p.applicants)}</dd></div>
                    </> : <>
                      <div><dt className="text-[11px] text-muted">GPA ขั้นต่ำ*</dt><dd className="num text-sm font-semibold">{p.min_gpa.toFixed(2)}</dd></div>
                      <div><dt className="text-[11px] text-muted">คะแนนขั้นต่ำ*</dt><dd className="num text-sm font-semibold">{p.min_score}%</dd></div>
                    </>}
                  </dl>
                  <div className="mt-3 text-xs text-muted">รวมต่อปี {baht(p.yearly_cost)} บาท · {p.score_source ? `เกณฑ์รับ: สถิติ ${p.score_source}` : '* ค่าประมาณ (ไม่มีในสถิติรอบ 3 ของ ทปอ.)'}</div>
                  <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                    <Link to={`/programs/${p.program_id}`} className="flex-1"><Button variant="secondary" size="sm" className="w-full">ดูรายละเอียด</Button></Link>
                    <Button variant={inC ? 'primary' : 'secondary'} size="sm" disabled={!inC && compare.length >= MAX_COMPARE} onClick={() => toggleCompare(p.program_id)}>{inC ? '✓ เทียบ' : '+ เทียบ'}</Button>
                    <button onClick={() => toggleSave(p)} className={cx('rounded-lg p-2 ring-1 ring-black/10 transition hover:bg-black/5', p.saved ? 'text-rose-500' : 'text-muted')} title="รายการโปรด" aria-label={`รายการโปรด ${uniLabel(p)}`}>
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={p.saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {list.length > shown && <div className="mt-5 text-center"><Button variant="secondary" onClick={() => setShown(shown + PAGE)}>แสดงเพิ่มอีก {Math.min(PAGE, list.length - shown)} จาก {baht(list.length - shown)} รายการที่เหลือ</Button></div>}
        </>
      )}
    </>
  );
}
