import { useEffect, useMemo, useRef, useState } from 'react';
import { api, reportUrl } from '../lib/api';
import { useStore, MAX_COMPARE } from '../lib/store';
import { evalSession } from '../lib/session';
import { HomeLocation } from '../components/HomeLocation';
import { SubjectScores } from '../components/SubjectScores';
import { Link, navigate } from '../lib/router';
import { baht, FLAG_TEXT, RISK, colorFor, uniLabel, pct, mapUrl } from '../lib/format';
import type { Criteria, EvalOptions, EvalResult, Meta, Profile, Ranked } from '../lib/types';
import { Badge, Button, Card, Empty, Field, Input, Loading, PageHeader, Select, Spinner, Stat, Toggle, cx, useToast } from '../components/ui';
import { Legend, StackedBars } from '../components/charts';

const PRESETS: { name: string; w: Record<string, number> }[] = [
  { name: 'เน้นประหยัด', w: { tuition: 55, admission: 20, location: 15, ranking: 10 } },
  { name: 'เน้นชื่อเสียง', w: { ranking: 55, admission: 20, tuition: 15, location: 10 } },
  { name: 'เน้นโอกาสสอบติด', w: { admission: 55, tuition: 20, location: 15, ranking: 10 } },
  { name: 'เน้นใกล้บ้าน', w: { location: 50, tuition: 25, admission: 15, ranking: 10 } },
];

const STEPS: [string, string][] = [
  ['กรอกข้อมูลของคุณ', 'GPA คะแนนสอบ งบค่าเล่าเรียนต่อปี จังหวัดที่อยู่ และสาขาที่สนใจ'],
  ['บอกว่าอะไรสำคัญ', 'กดปุ่มสำเร็จรูป เช่น “เน้นประหยัด” หรือเลื่อนแถบน้ำหนักเอง (รวม 100%)'],
  ['คัดกรอง', 'เปิด “เฉพาะสาขาที่สนใจ” หรือ “ไม่เกินงบ” เพื่อตัดตัวเลือกที่ไม่ใช่ออก'],
  ['ดูผลการจัดอันดับ', 'อันดับ 1 คือหลักสูตรที่เหมาะกับคุณที่สุด กด “+ เทียบ” เพื่อเปรียบเทียบ แล้วกดบันทึกผล'],
];

const hasPref = (v: string | null | undefined) => !!v && v !== 'ทั้งหมด';

/** ปรับน้ำหนักให้รวมเป็น 100 พอดี (ปัดเศษแล้วชดเชยตัวที่มากที่สุด) */
function to100(w: Record<number, number>): Record<number, number> {
  const ids = Object.keys(w).map(Number);
  const total = ids.reduce((s, id) => s + w[id], 0);
  if (total <= 0) return Object.fromEntries(ids.map((id) => [id, Math.round(100 / ids.length)]));
  const out = Object.fromEntries(ids.map((id) => [id, Math.round((w[id] / total) * 100)]));
  const diff = 100 - ids.reduce((s, id) => s + out[id], 0);
  const maxId = ids.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[maxId] += diff;
  return out;
}

export default function Analyze() {
  const toast = useToast();
  const { compare, toggleCompare } = useStore();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [options, setOptions] = useState<EvalOptions>({ eligibleOnly: false, withinBudget: true, matchField: false, matchRegion: false });
  const [result, setResult] = useState<EvalResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allFields, setAllFields] = useState(false); // ยอมให้จัดอันดับทุกสาขาปนกัน (ปกติต้องเลือกสาขาก่อน)
  const [help, setHelp] = useState(() => { try { return localStorage.getItem('dss-help') !== '0'; } catch { return true; } });
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    Promise.all([api<Meta>('/meta'), api<{ criteria: Criteria[] }>('/criteria'), api<{ profile: Profile }>('/profile'), api<{ saved: { program_id: number }[] }>('/saved-list')])
      .then(([m, c, p, s]) => {
        setMeta(m);
        setCriteria(c.criteria);
        setWeights(Object.fromEntries(c.criteria.map((x) => [x.criteria_id, Number(x.weight ?? x.default_weight)])));
        setProfile(p.profile);
        setSavedProfile(p.profile);
        // เลือกสาขาไว้แล้ว = แสดงเฉพาะสาขานั้นตั้งแต่แรก จะได้ไม่เห็นทุกคณะปนกัน
        setOptions((o) => ({ ...o, matchField: hasPref(p.profile.interest_field) }));
        // กลับมาจากหน้าอื่น: ใช้ค่าที่ปรับค้างไว้ในแท็บนี้ต่อ (น้ำหนัก / What-if / ตัวกรอง)
        const ses = evalSession.get();
        if (ses && ses.weights.length === c.criteria.length && ses.weights.every((w) => c.criteria.some((x) => x.criteria_id === w.criteriaId))) {
          setWeights(Object.fromEntries(ses.weights.map((w) => [w.criteriaId, w.value])));
          setProfile(ses.profile); setOptions(ses.options); setAllFields(ses.allFields);
        }
        setSavedIds(new Set(s.saved.map((x) => x.program_id)));
      })
      .catch((e) => setError(e.message));
  }, []);

  const total = Object.values(weights).reduce((s, v) => s + v, 0);

  // เก็บสถานะล่าสุดไว้ให้หน้าเปรียบเทียบ/รายละเอียดใช้ค่าชุดเดียวกัน
  useEffect(() => {
    if (!profile || criteria.length === 0) return;
    evalSession.set({ weights: Object.entries(weights).map(([k, v]) => ({ criteriaId: Number(k), value: v })), profile, options, allFields });
  }, [weights, profile, options, allFields, criteria.length]);

  // คำนวณใหม่แบบเรียลไทม์ทุกครั้งที่ปรับน้ำหนัก/โปรไฟล์/ตัวกรอง (หน่วง 250ms)
  useEffect(() => {
    if (!profile || criteria.length === 0) return;
    if (total <= 0 || (!allFields && !hasPref(profile.interest_field))) { abort.current?.abort(); setResult(null); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setComputing(true);
      try {
        const r = await api<EvalResult>('/evaluate', {
          body: { weights: Object.entries(weights).map(([k, v]) => ({ criteriaId: Number(k), value: v })), profile, options },
          signal: ctrl.signal,
        });
        setResult(r); setError('');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (abort.current === ctrl) setComputing(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [weights, profile, options, criteria.length, total, allFields]);

  const applyPreset = (w: Record<string, number>) =>
    setWeights(to100(Object.fromEntries(criteria.map((c) => [c.criteria_id, w[c.code] ?? c.default_weight]))));

  async function saveRun() {
    if (Math.round(total) !== 100) { toast('น้ำหนักรวมต้องเท่ากับ 100% ก่อนบันทึก', 'err'); return; }
    setSaving(true);
    try {
      if (JSON.stringify(profile) !== JSON.stringify(savedProfile)) {
        await api('/profile', { method: 'PUT', body: profile });
        setSavedProfile(profile);
      }
      const r = await api<EvalResult>('/evaluate', {
        body: { weights: Object.entries(weights).map(([k, v]) => ({ criteriaId: Number(k), value: v })), options, save: true },
      });
      setLastRun(r.runId ?? null);
      toast('บันทึกผลการประเมินเรียบร้อย');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setSaving(false); }
  }

  async function toggleSave(id: number) {
    const has = savedIds.has(id);
    try {
      if (has) await api(`/saved-list/${id}`, { method: 'DELETE' });
      else await api('/saved-list', { body: { programId: id } });
      setSavedIds((s) => { const n = new Set(s); has ? n.delete(id) : n.add(id); return n; });
      toast(has ? 'นำออกจากรายการโปรดแล้ว' : 'เพิ่มในรายการโปรดแล้ว');
    } catch (e) { toast((e as Error).message, 'err'); }
  }

  const top = result?.results[0];
  const tiedTop = result?.results.filter((r) => r.rank === 1).length ?? 0;
  const safeCount = result?.results.filter((r) => r.risk !== 'high').length ?? 0;
  // เหตุผลที่ไม่เหลือตัวเลือก (นับเฉพาะหลักสูตรในสาขา/ภูมิภาคที่ผู้ใช้กรองไว้)
  const inScope = (result?.excluded ?? []).filter((x) => !(options.matchField && x.flags.includes('field_mismatch')) && !(options.matchRegion && x.flags.includes('region_mismatch')));
  const cutBudget = inScope.filter((x) => x.flags.includes('over_budget'));
  const cutEligible = inScope.filter((x) => x.flags.includes('below_min_gpa') || x.flags.includes('below_min_score'));
  const cheapest = inScope.length ? Math.min(...inScope.map((x) => x.program.yearly_cost)) : null;
  const legend = criteria.map((c) => ({ label: c.criteria_name, color: colorFor(c.code) }));
  const rows = useMemo(() => (result?.results ?? []).slice(0, 10).map((r) => ({
    id: r.program.program_id,
    label: `${r.rank}. ${r.program.program_name.replace(/^(วท|วศ)\.บ\.\s*/, '')}`,
    sub: `${uniLabel(r.program)} · ${r.program.region}`,
    total: r.score,
    highlight: r.rank === 1,
    onClick: () => navigate(`/programs/${r.program.program_id}`),
    segments: r.details.map((d) => ({ key: d.code, label: d.name, value: d.weighted * 100, color: colorFor(d.code), note: `ค่าดิบ ${baht(d.raw)} → normalized ${d.normalized.toFixed(3)} × น้ำหนัก ${(d.weight * 100).toFixed(0)}%` })),
  })), [result]);

  // จอเล็ก: แผงกรอกข้อมูลอยู่เหนือผลลัพธ์และยาวหลายหน้าจอ จึงมีปุ่มลอยพาไปที่ผล (ซ่อนเมื่อเห็นผลอยู่แล้ว)
  const [atResults, setAtResults] = useState(false);
  const hasResult = !!result;
  useEffect(() => {
    const el = document.getElementById('results');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setAtResults(e.isIntersecting), { rootMargin: '0px 0px -35% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasResult, profile != null && meta != null]);

  if (!profile || !meta) return error ? <Card><Empty title="โหลดข้อมูลไม่สำเร็จ">{error}</Empty></Card> : <Loading />;
  const setP = (k: keyof Profile, v: string) => {
    setProfile({ ...profile, [k]: v === '' ? null : (k === 'preferred_region' || k === 'interest_field' || k === 'home_province') ? v : Number(v) });
    if (k === 'interest_field') setOptions((o) => ({ ...o, matchField: hasPref(v) }));
  };

  return (
    <>
      <PageHeader
        title="วิเคราะห์และจัดอันดับหลักสูตร"
        sub="ปรับข้อมูลหรือน้ำหนัก ผลลัพธ์และกราฟจะคำนวณใหม่ทันที (Simple Additive Weighting)"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {lastRun && <>
              <Button variant="secondary" onClick={() => navigate(`/history/${lastRun}`)}>ดูผลที่บันทึก</Button>
              <a href={reportUrl(lastRun)} target="_blank" rel="noreferrer"><Button variant="secondary">รายงาน PDF</Button></a>
            </>}
            <Button onClick={saveRun} loading={saving} disabled={!result || result.results.length === 0}>บันทึกผลการประเมิน</Button>
          </div>
        }
      />

      {result && result.results.length > 0 && !atResults && (
        <button onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}
          className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 z-20 min-h-11 rounded-full bg-ink px-4 text-sm font-medium text-white shadow-lg xl:hidden">
          ดูผล {result.results.length} หลักสูตร ↓
        </button>
      )}

      <details className="mb-5 rounded-2xl border-l-4 border-amber-400 bg-white px-5 py-3 text-sm shadow-[0_1px_2px_#1e1b4b14] ring-1 ring-brand-900/10" open={help}
        onToggle={(e) => { const o = e.currentTarget.open; setHelp(o); try { localStorage.setItem('dss-help', o ? '1' : '0'); } catch { /* ไม่มี localStorage ก็ไม่เป็นไร */ } }}>
        <summary className="cursor-pointer font-medium text-brand-700">วิธีใช้งานหน้านี้ (4 ขั้นตอน)</summary>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-2.5">
              <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
              <span><b className="block text-ink">{t}</b><span className="text-ink-2">{d}</span></span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">ค่าเทอมเป็นค่าจริงต่อ 1 เทอมจากประกาศของมหาวิทยาลัย (คะแนนและงบเทียบเป็นรายปี เพราะบางแห่งมี 3 เทอมต่อปี) · อันดับมหาวิทยาลัยอ้างอิง THE World University Rankings 2026 · โอกาสสอบติดเทียบกับคะแนนต่ำสุด–สูงสุดจริงของ TCAS รอบ 3 ปีล่าสุด (หลักสูตรที่ไม่มีสถิติใช้ค่าประมาณ)</p>
      </details>

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        {/* ---------------- แผงควบคุม ---------------- */}
        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card step={1} title="ข้อมูลของคุณ" sub="ทดลองเปลี่ยนเพื่อดูผลแบบ What-if ได้ (บันทึกเมื่อกดบันทึกผล)">
            <div className="grid grid-cols-2 gap-3">
              <Field label="GPA สะสม"><Input type="number" step="0.01" min={0} max={4} value={profile.gpa ?? ''} onChange={(e) => setP('gpa', e.target.value)} /></Field>
              <Field label="คะแนนสอบ (%)"><Input type="number" step="1" min={0} max={100} value={profile.exam_score ?? ''} onChange={(e) => setP('exam_score', e.target.value)} /></Field>
              <div className="col-span-2"><SubjectScores profile={profile} meta={meta} onChange={(patch) => setProfile({ ...profile, ...patch })} /></div>
              <div className="col-span-2"><Field label="งบค่าเล่าเรียนต่อปี (บาท)" hint="ค่าเทอม × จำนวนเทอมต่อปี เช่น เทอมละ 17,100 สองเทอม = 34,200"><Input type="number" step="1000" min={0} value={profile.budget ?? ''} onChange={(e) => setP('budget', e.target.value)} /></Field></div>
              <div className="col-span-2">
                <HomeLocation profile={profile} meta={meta} onChange={(patch) => setProfile({ ...profile, ...patch })} />
              </div>
              <Field label="ภูมิภาคที่สนใจ">
                <Select value={profile.preferred_region ?? 'ทั้งหมด'} onChange={(e) => setP('preferred_region', e.target.value)}>
                  <option>ทั้งหมด</option>{meta.regions.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="สาขาที่สนใจ">
                <Select value={profile.interest_field ?? 'ทั้งหมด'} onChange={(e) => setP('interest_field', e.target.value)}>
                  <option>ทั้งหมด</option>{meta.fields.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          <Card step={2} title="อะไรสำคัญกับคุณ (น้ำหนักเกณฑ์)"
            action={<span className={cx('num whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', Math.round(total) === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>รวม {total}%</span>}>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <button key={p.name} onClick={() => applyPreset(p.w)} className="min-h-9 rounded-full bg-stone-100 px-3 py-1 text-xs text-ink-2 transition hover:bg-brand-50 hover:text-brand-700 sm:min-h-0 sm:px-2.5">{p.name}</button>)}
              <button onClick={() => applyPreset({})} className="min-h-9 rounded-full px-3 py-1 text-xs text-muted hover:text-ink sm:min-h-0 sm:px-2.5">ค่าเริ่มต้น</button>
            </div>
            <div className="space-y-4">
              {criteria.map((c) => {
                const v = weights[c.criteria_id] ?? 0;
                const color = colorFor(c.code);
                return (
                  <div key={c.criteria_id}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
                        {c.criteria_name}
                        <span className="text-[11px] text-muted">{c.type === 'cost' ? 'ยิ่งน้อยยิ่งดี' : 'ยิ่งมากยิ่งดี'}</span>
                      </span>
                      <span className="num w-10 text-right font-semibold">{v}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={1} value={v} className="slider w-full"
                      style={{ ['--p' as string]: `${v}%`, ['--c' as string]: color }}
                      onChange={(e) => setWeights({ ...weights, [c.criteria_id]: Number(e.target.value) })} aria-label={c.criteria_name} />
                  </div>
                );
              })}
            </div>
            {Math.round(total) !== 100 && (
              <div className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>▲ น้ำหนักรวม {total}% (ระบบคำนวณตามสัดส่วนให้ แต่ต้องเป็น 100% ก่อนบันทึก)</span>
                <Button size="sm" variant="secondary" onClick={() => setWeights(to100(weights))}>ปรับเป็น 100%</Button>
              </div>
            )}
          </Card>

          <Card step={3} title="ตัวกรอง (Business Rules)">
            <Toggle checked={!!options.eligibleOnly} onChange={(v) => setOptions({ ...options, eligibleOnly: v })} label="เฉพาะที่คะแนนถึงเกณฑ์" hint="คะแนนสอบไม่ต่ำกว่าคะแนนต่ำสุดที่สอบติดปีก่อน" />
            <Toggle checked={!!options.withinBudget} onChange={(v) => setOptions({ ...options, withinBudget: v })} label="เฉพาะที่ค่าเล่าเรียนไม่เกินงบ" hint={profile.budget ? `งบ ${baht(profile.budget)} บาท/ปี` : 'ยังไม่ได้ระบุงบ'} />
            <Toggle checked={!!options.matchField} onChange={(v) => setOptions({ ...options, matchField: v })} label="เฉพาะสาขาที่สนใจ" />
            <Toggle checked={!!options.matchRegion} onChange={(v) => setOptions({ ...options, matchRegion: v })} label="เฉพาะภูมิภาคที่สนใจ" />
          </Card>
        </div>

        {/* ---------------- ผลลัพธ์ ---------------- */}
        <div id="results" className="min-w-0 scroll-mt-16 space-y-5">
          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {!result ? (
            <Card>{total <= 0 ? <Empty title="ยังไม่มีน้ำหนัก">ปรับน้ำหนักอย่างน้อย 1 เกณฑ์เพื่อเริ่มคำนวณ</Empty>
              : !allFields && !hasPref(profile.interest_field) ? (
                <Empty title="เลือกสาขาที่สนใจก่อน" icon="☝">
                  เลือก “สาขาที่สนใจ” ในกล่องข้อมูลผู้สมัคร ระบบจะจัดอันดับเฉพาะหลักสูตรในสาขานั้น<br />
                  (การเทียบข้ามสาขา เช่น แพทย์กับภาษาอังกฤษ จะได้ผลที่ไม่มีความหมาย เพราะคณะค่าเทอมถูกจะชนะเสมอ)
                  <div className="mt-4"><Button size="sm" variant="ghost" onClick={() => setAllFields(true)}>ยังไม่แน่ใจ ขอดูทุกสาขารวมกัน</Button></div>
                </Empty>
              ) : <Loading text="กำลังคำนวณ..." />}</Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label={options.matchField && hasPref(profile.interest_field) ? 'ผ่านการคัดกรอง (ในสาขานี้)' : 'ผ่านการคัดกรอง'} value={<>{result.summary.candidates}<span className="text-base font-normal text-muted"> / {result.summary.candidates + inScope.length}</span></>} sub={inScope.length ? `คัดออก ${inScope.length} หลักสูตร (เกินงบ/ไม่ผ่านเกณฑ์)` : 'ไม่มีหลักสูตรถูกคัดออก'} />
                <Stat label={tiedTop > 1 ? `แนะนำอันดับ 1 (ร่วม ${tiedTop} หลักสูตร)` : 'แนะนำอันดับ 1'} value={top ? top.score.toFixed(1) : '-'} sub={top ? `${top.program.program_name} · ${uniLabel(top.program)}` : 'ไม่มีหลักสูตรที่ผ่านเกณฑ์'} accent="#2a78d6" />
                <Stat accent="#d97706" label="ห่างจากอันดับ 2" value={result.summary.topGap != null ? result.summary.topGap.toFixed(2) : '-'} sub={result.summary.topGap != null && result.summary.topGap < 1 ? 'สูสีมาก ควรเปรียบเทียบเพิ่ม' : 'คะแนนนำชัดเจน'} />
                <Stat accent="#059669" label="ความเสถียรของคำแนะนำ" value={result.sensitivity ? pct(result.sensitivity.stability) : '-'} sub="อันดับ 1 คงเดิมเมื่อปรับน้ำหนัก ±10–20%" />
              </div>

              {top && top.risk === 'high' && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-600/20">
                  <b>■ ระวัง: อันดับ 1 มีโอกาสสอบติดเพียง {top.admissionChance}%</b>{' '}
                  {safeCount === 0
                    ? 'และไม่มีหลักสูตรใดในรายการนี้ที่ความเสี่ยงต่ำหรือปานกลาง คะแนนสอบยังห่างจากคะแนนต่ำสุดที่สอบติดปีก่อน ควรพิจารณาสาขาใกล้เคียงหรือมหาวิทยาลัยที่เกณฑ์ต่ำกว่า'
                    : `มี ${safeCount} หลักสูตรในรายการที่ความเสี่ยงต่ำกว่า ลองกดปุ่ม “เน้นโอกาสสอบติด” หรือเปิด “เฉพาะที่คะแนนถึงเกณฑ์”`}
                </div>
              )}
              {top && top.risk !== 'high' && tiedTop > 1 && (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
                  ▲ มี {tiedTop} หลักสูตรได้คะแนนเท่ากันที่อันดับ 1 เพราะค่าเล่าเรียน อันดับมหาวิทยาลัย ระยะทาง และโอกาสสอบติดเท่ากัน ระบบแยกไม่ได้ ควรเลือกจากเนื้อหาหลักสูตรที่ตรงความสนใจ
                </div>
              )}

              <Card step={4} title="หลักสูตรที่เหมาะสมที่สุด 10 อันดับแรก" sub="ความยาวแต่ละสี = คะแนนที่ได้จากเกณฑ์นั้น (normalized × น้ำหนัก × 100) · คลิกเพื่อดูรายละเอียด"
                action={computing ? <span className="flex items-center gap-1.5 text-xs text-muted"><Spinner className="h-3.5 w-3.5" />คำนวณ</span> : result.cacheHit ? <Badge>cache</Badge> : null}>
                {rows.length ? <>
                  <div className="mb-4"><Legend items={legend} /></div>
                  <StackedBars rows={rows} />
                </> : <Empty title="ไม่มีหลักสูตรที่ผ่านเงื่อนไข">
                  {inScope.length > 0 ? <>
                    ในขอบเขตที่เลือกมี {inScope.length} หลักสูตร แต่ถูกคัดออกทั้งหมด:
                    {options.withinBudget && cutBudget.length > 0 && <> เกินงบ {cutBudget.length} หลักสูตร (ถูกที่สุด {baht(cheapest)} บาท/ปี{profile.budget ? ` งบของคุณ ${baht(profile.budget)}` : ''})</>}
                    {options.eligibleOnly && cutEligible.length > 0 && <> · คะแนนต่ำกว่าเกณฑ์ {cutEligible.length} หลักสูตร</>}
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {options.withinBudget && cutBudget.length > 0 && <Button size="sm" variant="secondary" onClick={() => setOptions({ ...options, withinBudget: false })}>ดูหลักสูตรที่เกินงบด้วย</Button>}
                      {options.eligibleOnly && cutEligible.length > 0 && <Button size="sm" variant="secondary" onClick={() => setOptions({ ...options, eligibleOnly: false })}>ดูหลักสูตรที่ต่ำกว่าเกณฑ์ด้วย</Button>}
                    </div>
                  </> : 'ไม่มีหลักสูตรในสาขาและภูมิภาคที่เลือก ลองเปลี่ยนภูมิภาคหรือปิดตัวกรองภูมิภาค'}
                </Empty>}
              </Card>

              {result.results.length > 0 && (
                <Card title={`ผลการจัดอันดับทั้งหมด (${result.results.length})`} sub={`เลือกได้สูงสุด ${MAX_COMPARE} หลักสูตรเพื่อเปรียบเทียบ`}
                  action={compare.length > 0 ? <Link to="/compare"><Button size="sm">เปรียบเทียบ ({compare.length})</Button></Link> : null}>
                  {/* จอเล็ก: การ์ดเรียงลงมา ไม่ต้องเลื่อนตารางแนวนอน */}
                  <div className="-mx-5 divide-y divide-line/70 border-t border-line md:hidden">
                    {(showAll ? result.results : result.results.slice(0, 10)).map((r) => <ResultCard key={r.program.program_id} r={r} max={top!.score} home={profile}
                      inCompare={compare.includes(r.program.program_id)} onCompare={() => toggleCompare(r.program.program_id)} compareFull={compare.length >= MAX_COMPARE}
                      saved={savedIds.has(r.program.program_id)} onSave={() => toggleSave(r.program.program_id)} />)}
                  </div>
                  <div className="-mx-5 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead><tr className="border-b border-line text-left text-xs text-muted">
                        <th className="px-5 py-2 font-medium">#</th><th className="py-2 font-medium">หลักสูตร</th><th className="py-2 font-medium">คะแนน SAW</th>
                        <th className="py-2 font-medium">โอกาสสอบติด</th><th className="whitespace-nowrap py-2 text-right font-medium">ค่าเทอม/เทอม</th><th className="px-5 py-2 text-right font-medium"></th>
                      </tr></thead>
                      <tbody>
                        {(showAll ? result.results : result.results.slice(0, 10)).map((r) => <ResultRow key={r.program.program_id} r={r} max={top!.score} home={profile}
                          inCompare={compare.includes(r.program.program_id)} onCompare={() => toggleCompare(r.program.program_id)} compareFull={compare.length >= MAX_COMPARE}
                          saved={savedIds.has(r.program.program_id)} onSave={() => toggleSave(r.program.program_id)} />)}
                      </tbody>
                    </table>
                  </div>
                  {result.results.length > 10 &&<div className="mt-3 text-center"><Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'แสดงน้อยลง' : `แสดงทั้งหมด ${result.results.length} รายการ`}</Button></div>}
                </Card>
              )}

              {(inScope.length > 0 || (result.sensitivity?.scenarios.length ?? 0) > 0) && (
                <div className="text-center">
                  <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
                    {showAdvanced ? 'ซ่อนการวิเคราะห์เชิงลึก' : `ดูการวิเคราะห์เชิงลึก (ความไวของผลลัพธ์${inScope.length ? ` · ถูกคัดออก ${inScope.length} หลักสูตร` : ''})`}
                  </Button>
                </div>
              )}

              {showAdvanced && result.sensitivity && result.sensitivity.scenarios.length > 0 && <Sensitivity result={result} criteria={criteria} />}

              {showAdvanced && inScope.length > 0 && (
                <Card title={`หลักสูตรที่ถูกคัดออก (${inScope.length})`} sub="ตามกฎคัดกรองที่เปิดใช้งาน (ไม่นับหลักสูตรนอกสาขา/ภูมิภาคที่เลือก)">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {inScope.map((x) => (
                      <div key={x.program.program_id} className="flex items-start justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2">
                        <div className="min-w-0 text-sm"><div className="truncate">{x.program.program_name}</div><div className="text-xs text-muted">{uniLabel(x.program)}</div></div>
                        <div className="flex flex-wrap justify-end gap-1">{x.flags.filter((f) => f !== 'region_mismatch' || options.matchRegion).filter((f) => f !== 'field_mismatch' || options.matchField).map((f) => <Badge key={f} tone="red">{FLAG_TEXT[f]}</Badge>)}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ResultRow({ r, max, home, inCompare, onCompare, compareFull, saved, onSave }: { r: Ranked; max: number; home: Profile; inCompare: boolean; onCompare: () => void; compareFull: boolean; saved: boolean; onSave: () => void }) {
  const risk = RISK[r.risk];
  const flags = r.flags.filter((f) => f !== 'region_mismatch' && f !== 'field_mismatch');
  return (
    <tr className="border-b border-line/70 last:border-0 hover:bg-stone-50/70">
      <td className="px-5 py-3 align-top"><span className={cx('num inline-grid h-7 w-7 place-items-center rounded-full text-xs font-semibold', r.rank <= 3 ? 'bg-brand-600 text-white' : 'bg-stone-100 text-ink-2')}>{r.rank}</span></td>
      <td className="py-3 pr-4 align-top">
        <Link to={`/programs/${r.program.program_id}`} className="font-medium text-ink hover:text-brand-700">{r.program.program_name}</Link>
        <div className="text-xs text-muted">{r.program.uni_name} · {r.program.province ?? r.program.region}{r.distanceKm != null && <> · <a href={mapUrl(r.program, home)} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-brand-700" title="เปิดเส้นทางใน Google Maps">ห่างบ้านราว {baht(r.distanceKm)} กม. ↗</a></>}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {r.strengths.slice(0, 2).map((s) => <Badge key={s} tone="green">+ {s}</Badge>)}
          {flags.map((f) => <Badge key={f} tone="red">{FLAG_TEXT[f]}</Badge>)}
        </div>
      </td>
      <td className="w-[160px] py-3 pr-4 align-top">
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-stone-100"><div className="h-2 rounded-r-[4px] rounded-l-full bg-[#2a78d6]" style={{ width: `${(r.score / max) * 100}%` }} /></div>
          <span className="num w-11 text-right font-semibold">{r.score.toFixed(1)}</span>
        </div>
      </td>
      <td className="whitespace-nowrap py-3 pr-4 align-top">
        <div className="num font-medium">{r.admissionChance}%</div>
        <span className={cx('mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] ring-1 ring-inset', risk.cls)}><span style={{ color: risk.dot }}>{risk.icon}</span>{risk.text}</span>
      </td>
      <td className="num py-3 text-right align-top">{baht(r.program.tuition_fee)}<div className="whitespace-nowrap text-[11px] text-muted">{baht(r.program.yearly_cost)}/ปี</div></td>
      <td className="px-5 py-3 text-right align-top">
        <div className="flex justify-end gap-1">
          <button onClick={onSave} title={saved ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'} className={cx('rounded-md p-1.5 transition hover:bg-black/5', saved ? 'text-rose-500' : 'text-muted')}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
          </button>
          <button onClick={onCompare} disabled={!inCompare && compareFull} className={cx('whitespace-nowrap rounded-md px-2 py-1 text-xs ring-1 transition disabled:opacity-40', inCompare ? 'bg-brand-600 text-white ring-brand-600' : 'text-ink-2 ring-black/10 hover:bg-black/5')}>
            {inCompare ? '✓ เทียบ' : '+ เทียบ'}
          </button>
        </div>
      </td>
    </tr>
  );
}

/** ผลหนึ่งรายการแบบการ์ด สำหรับจอโทรศัพท์ */
function ResultCard({ r, max, home, inCompare, onCompare, compareFull, saved, onSave }: { r: Ranked; max: number; home: Profile; inCompare: boolean; onCompare: () => void; compareFull: boolean; saved: boolean; onSave: () => void }) {
  const risk = RISK[r.risk];
  const flags = r.flags.filter((f) => f !== 'region_mismatch' && f !== 'field_mismatch');
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-start gap-3">
        <span className={cx('num mt-0.5 inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold', r.rank <= 3 ? 'bg-brand-600 text-white' : 'bg-stone-100 text-ink-2')}>{r.rank}</span>
        <div className="min-w-0 flex-1">
          <Link to={`/programs/${r.program.program_id}`} className="block font-medium leading-snug text-ink">{r.program.program_name}</Link>
          <div className="mt-0.5 text-xs text-muted">{r.program.uni_name} · {r.program.province ?? r.program.region}</div>
        </div>
        <span className="num shrink-0 text-lg font-semibold leading-none text-ink">{r.score.toFixed(1)}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-stone-100"><div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(r.score / max) * 100}%` }} /></div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-muted">โอกาสสอบติด</div><div className="num mt-0.5 text-sm font-medium">{r.admissionChance}% <span style={{ color: risk.dot }}>{risk.icon}</span></div><div className="text-[11px] text-muted">{risk.text}</div></div>
        <div><div className="text-muted">ค่าเทอม</div><div className="num mt-0.5 text-sm font-medium">{baht(r.program.tuition_fee)}</div><div className="num text-[11px] text-muted">{baht(r.program.yearly_cost)}/ปี</div></div>
        <div><div className="text-muted">ห่างบ้าน</div>{r.distanceKm != null
          ? <a href={mapUrl(r.program, home)} target="_blank" rel="noreferrer" className="num mt-0.5 block text-sm font-medium underline decoration-dotted">{baht(r.distanceKm)} กม. ↗</a>
          : <div className="mt-0.5 text-sm text-muted">ยังไม่ระบุ</div>}</div>
      </div>
      {(r.strengths.length > 0 || flags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.strengths.slice(0, 2).map((s) => <Badge key={s} tone="green">+ {s}</Badge>)}
          {flags.map((f) => <Badge key={f} tone="red">{FLAG_TEXT[f]}</Badge>)}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Link to={`/programs/${r.program.program_id}`} className="grid min-h-10 flex-1 place-items-center rounded-lg text-sm text-ink ring-1 ring-black/10 active:bg-black/5">ดูรายละเอียด</Link>
        <button onClick={onCompare} disabled={!inCompare && compareFull} className={cx('min-h-10 rounded-lg px-4 text-sm ring-1 transition disabled:opacity-40', inCompare ? 'bg-brand-600 text-white ring-brand-600' : 'text-ink-2 ring-black/10 active:bg-black/5')}>{inCompare ? '✓ เทียบ' : '+ เทียบ'}</button>
        <button onClick={onSave} aria-label={saved ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'} className={cx('grid min-h-10 w-11 place-items-center rounded-lg ring-1 ring-black/10 active:bg-black/5', saved ? 'text-rose-500' : 'text-muted')}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
        </button>
      </div>
    </div>
  );
}

function Sensitivity({ result, criteria }: { result: EvalResult; criteria: Criteria[] }) {
  const deltas = [-20, -10, 10, 20];
  const s = result.sensitivity!;
  const top = result.results[0];
  const changers = s.scenarios.filter((x) => x.changed);
  return (
    <Card title="การวิเคราะห์ความไว (Sensitivity Analysis)"
      sub={`ถ้าปรับน้ำหนักเกณฑ์ใดเกณฑ์หนึ่ง (เกณฑ์อื่นปรับตามสัดส่วน) อันดับ 1 "${top.program.program_name} (${uniLabel(top.program)})" ยังคงเดิมหรือไม่`}>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <thead><tr className="text-xs text-muted"><th className="w-44 py-1.5 text-left font-medium">เกณฑ์</th>{deltas.map((d) => <th key={d} className="py-1.5 font-medium">{d > 0 ? `+${d}` : d}%</th>)}</tr></thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.criteria_id}>
                <td className="truncate py-1 pr-3 text-ink-2"><span className="mr-2 inline-block h-2 w-2 rounded-[2px]" style={{ background: colorFor(c.code) }} />{c.criteria_name}</td>
                {deltas.map((d) => {
                  const sc = s.scenarios.find((x) => x.criteria_id === c.criteria_id && x.delta === d);
                  return (
                    <td key={d} className="p-1">
                      {!sc ? <div className="rounded-md bg-stone-50 py-1.5 text-center text-xs text-muted">–</div>
                        : sc.changed ? <div title={`อันดับ 1 เปลี่ยนเป็น ${sc.topProgramName}`} className="truncate rounded-md bg-amber-50 px-2 py-1.5 text-center text-xs text-amber-900 ring-1 ring-inset ring-amber-600/20">▲ {sc.topProgramName}</div>
                          : <div className="rounded-md bg-emerald-50 py-1.5 text-center text-xs text-emerald-800">● คงเดิม</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-ink-2">
        {changers.length === 0 ? 'คำแนะนำนี้เสถียรมาก — แม้ปรับน้ำหนักทุกเกณฑ์ ±20% อันดับ 1 ก็ไม่เปลี่ยน'
          : `อันดับ 1 เปลี่ยนใน ${changers.length} จาก ${s.scenarios.length} สถานการณ์ — หากยังไม่แน่ใจเรื่องน้ำหนักของเกณฑ์ที่มีสีเหลือง ควรนำหลักสูตรที่แสดงไปเปรียบเทียบด้วย`}
      </p>
    </Card>
  );
}
