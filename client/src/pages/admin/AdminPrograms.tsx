import { useEffect, useMemo, useState } from 'react';
import { api, download } from '../../lib/api';
import { baht } from '../../lib/format';
import type { Meta, Program } from '../../lib/types';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '../../components/ui';

const EMPTY = { uni_id: '', program_name: '', faculty: '', field: '', degree: 'ปริญญาตรี', tuition_fee: '', yearly_cost: '', min_gpa: '', min_score: '', capacity: '', ranking: '', description: '' };
type Form = typeof EMPTY;
interface ImportResult { total: number; valid: number; errors: { line: number; message: string }[]; inserted: number; updated: number; dryRun: boolean }

export default function AdminPrograms() {
  const toast = useToast();
  const [rows, setRows] = useState<Program[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id: number | null; f: Form } | null>(null);
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState<{ csv: string; name: string; result: ImportResult | null } | null>(null);

  const load = () => api<{ programs: Program[] }>('/admin/programs').then((r) => setRows(r.programs));
  useEffect(() => { load(); api<Meta>('/meta').then(setMeta); }, []);
  const list = useMemo(() => (rows ?? []).filter((p) => !q || `${p.program_name} ${p.uni_name} ${p.short_name} ${p.faculty}`.includes(q)), [rows, q]);

  async function save() {
    setBusy(true);
    try {
      const body = { ...edit!.f, description: edit!.f.description || null };
      if (edit!.id) await api(`/admin/programs/${edit!.id}`, { method: 'PUT', body });
      else await api('/admin/programs', { body });
      toast(edit!.id ? 'แก้ไขหลักสูตรแล้ว' : 'เพิ่มหลักสูตรแล้ว');
      setEdit(null); load();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function del(p: Program) {
    if (!confirm(`ลบ "${p.program_name}" (${p.short_name})?`)) return;
    try { await api(`/admin/programs/${p.program_id}`, { method: 'DELETE' }); toast('ลบแล้ว'); load(); } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function runImport(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api<ImportResult>('/admin/programs/import', { body: { csv: imp!.csv, dryRun } });
      setImp({ ...imp!, result: r });
      if (!dryRun) { toast(`นำเข้าสำเร็จ: เพิ่ม ${r.inserted} แก้ไข ${r.updated}`); load(); }
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  const openEdit = (p?: Program) => setEdit(p
    ? { id: p.program_id, f: Object.fromEntries(Object.keys(EMPTY).map((k) => [k, String((p as any)[k] ?? '')])) as Form }
    : { id: null, f: { ...EMPTY } });
  const set = (k: keyof Form, v: string) => setEdit({ ...edit!, f: { ...edit!.f, [k]: v } });

  return (
    <>
      <PageHeader title="จัดการข้อมูลหลักสูตร" sub="เพิ่ม แก้ไข ลบ และนำเข้าข้อมูลจากไฟล์ CSV (ระบบตรวจสอบความถูกต้องก่อนบันทึก)"
        action={<div className="flex gap-2">
          <Button variant="secondary" onClick={() => download('/admin/programs/export.csv', 'programs.csv')}>ส่งออก CSV</Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-black/10 hover:bg-stone-50">
            นำเข้า CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImp({ csv: await f.text(), name: f.name, result: null }); e.target.value = ''; }} />
          </label>
          <Button onClick={() => openEdit()}>+ เพิ่มหลักสูตร</Button>
        </div>} />
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3"><Input className="max-w-sm" placeholder="ค้นหาชื่อหลักสูตร มหาวิทยาลัย หรือคณะ..." value={q} onChange={(e) => setQ(e.target.value)} /><span className="text-xs text-muted">{rows ? `พบ ${baht(list.length)} จาก ${baht(rows.length)} หลักสูตร${list.length > 150 ? " · แสดง 150 รายการแรก พิมพ์ค้นหาเพื่อจำกัดผล" : ""}` : ""}</span></div>
        {!rows ? <Loading /> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">หลักสูตร</th><th className="py-2 font-medium">มหาวิทยาลัย</th><th className="py-2 text-right font-medium">ค่าเทอม/เทอม</th>
                <th className="py-2 text-right font-medium">เกณฑ์รับ (คะแนนต่ำสุด–สูงสุด หรือ GPA/คะแนน)</th><th className="py-2 text-right font-medium">อันดับ ม.</th><th className="px-5 py-2"></th>
              </tr></thead>
              <tbody>
                {list.slice(0, 150).map((p) => (
                  <tr key={p.program_id} className="border-b border-line/60 last:border-0 hover:bg-stone-50">
                    <td className="px-5 py-2"><div className="font-medium">{p.program_name}</div><div className="text-xs text-muted">{p.faculty} · <Badge>{p.field}</Badge></div></td>
                    <td className="py-2">{p.short_name}<div className="text-xs text-muted">{p.region}</div></td>
                    <td className="num py-2 text-right">{baht(p.tuition_fee)}<div className="text-[11px] text-muted">{baht(p.yearly_cost)}/ปี</div></td>
                    <td className="num py-2 text-right">{p.score_source ? <>{p.min_score} – {p.max_score}<div className="text-[11px] text-emerald-700">สถิติจริง</div></> : <>{p.min_gpa.toFixed(2)} / {p.min_score}%<div className="text-[11px] text-muted">ประมาณ</div></>}</td>
                    <td className="num py-2 text-right">#{p.ranking}</td>
                    <td className="px-5 py-2 text-right whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => openEdit(p)}>แก้ไข</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => del(p)}>ลบ</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'แก้ไขหลักสูตร' : 'เพิ่มหลักสูตร'} wide
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button><Button onClick={save} loading={busy}>บันทึก</Button></>}>
        {edit && meta && (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="มหาวิทยาลัย"><Select value={edit.f.uni_id} onChange={(e) => set('uni_id', e.target.value)}><option value="">— เลือก —</option>{meta.universities.map((u) => <option key={u.uni_id} value={u.uni_id}>{u.uni_name}</option>)}</Select></Field>
            <Field label="กลุ่มสาขา"><Select value={edit.f.field} onChange={(e) => set('field', e.target.value)}><option value="">— เลือก —</option>{meta.fields.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <Field label="ชื่อหลักสูตร"><Input value={edit.f.program_name} onChange={(e) => set('program_name', e.target.value)} placeholder="เช่น วิทยาการคอมพิวเตอร์" /></Field>
            <Field label="คณะ"><Input value={edit.f.faculty} onChange={(e) => set('faculty', e.target.value)} /></Field>
            <Field label="ค่าเทอมต่อเทอม (บาท)"><Input type="number" value={edit.f.tuition_fee} onChange={(e) => set('tuition_fee', e.target.value)} /></Field>
            <Field label="ค่าเล่าเรียนต่อปี (บาท)" hint="ใช้คำนวณคะแนนและเทียบงบ · เว้นว่าง = ค่าเทอม × 2"><Input type="number" value={edit.f.yearly_cost} onChange={(e) => set('yearly_cost', e.target.value)} /></Field>
            <Field label="จำนวนรับ (คน)"><Input type="number" value={edit.f.capacity} onChange={(e) => set('capacity', e.target.value)} /></Field>
            <Field label="GPA ขั้นต่ำ"><Input type="number" step="0.01" value={edit.f.min_gpa} onChange={(e) => set('min_gpa', e.target.value)} /></Field>
            <Field label="คะแนนสอบขั้นต่ำ (%)"><Input type="number" value={edit.f.min_score} onChange={(e) => set('min_score', e.target.value)} /></Field>
            <Field label="อันดับมหาวิทยาลัยในไทย"><Input type="number" value={edit.f.ranking} onChange={(e) => set('ranking', e.target.value)} /></Field>
            <Field label="ระดับปริญญา"><Input value={edit.f.degree} onChange={(e) => set('degree', e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="รายละเอียด (ถ้ามี)"><Input value={edit.f.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
          </div>
        )}
      </Modal>

      <Modal open={!!imp} onClose={() => setImp(null)} title={`นำเข้าข้อมูลจาก ${imp?.name ?? ''}`} wide
        footer={<><Button variant="secondary" onClick={() => setImp(null)}>ปิด</Button>
          <Button variant="secondary" onClick={() => runImport(true)} loading={busy}>ตรวจสอบข้อมูล</Button>
          <Button onClick={() => runImport(false)} loading={busy} disabled={!imp?.result || imp.result.valid === 0 || !imp.result.dryRun}>นำเข้า {imp?.result?.valid ?? ''} รายการ</Button></>}>
        {imp && (
          <div className="space-y-3 text-sm">
            <p className="text-ink-2">คอลัมน์ที่ต้องมี: <code className="rounded bg-stone-100 px-1 text-xs">university, program_name, faculty, field, tuition_fee, min_gpa, min_score, capacity, ranking</code> (คอลัมน์เสริม: <code className="rounded bg-stone-100 px-1 text-xs">yearly_cost</code>) — ถ้าหลักสูตรมีอยู่แล้วจะอัปเดตข้อมูล</p>
            <pre className="max-h-40 overflow-auto rounded-lg bg-stone-50 p-3 text-xs">{imp.csv.split('\n').slice(0, 6).join('\n')}</pre>
            {imp.result && (
              <div className="rounded-lg ring-1 ring-black/10">
                <div className="flex gap-4 border-b border-line px-4 py-2.5">
                  <span>ทั้งหมด <b>{imp.result.total}</b></span><span className="text-emerald-700">ผ่าน <b>{imp.result.valid}</b></span><span className="text-red-700">ผิดพลาด <b>{imp.result.errors.length}</b></span>
                  {!imp.result.dryRun && <span>เพิ่ม <b>{imp.result.inserted}</b> · แก้ไข <b>{imp.result.updated}</b></span>}
                </div>
                {imp.result.errors.length > 0 && <ul className="max-h-40 overflow-auto px-4 py-2 text-xs text-red-700">{imp.result.errors.map((e) => <li key={e.line}>บรรทัด {e.line}: {e.message}</li>)}</ul>}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
