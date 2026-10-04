import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Meta } from '../../lib/types';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '../../components/ui';

interface Uni { uni_id: number; uni_name: string; short_name: string | null; region: string; province: string | null; lat: number | null; lng: number | null; type: 'รัฐ' | 'เอกชน'; website: string | null; programs: number }
const EMPTY = { uni_name: '', short_name: '', region: '', province: '', type: 'รัฐ', website: '', lat: '', lng: '' };

export default function AdminUniversities() {
  const toast = useToast();
  const [rows, setRows] = useState<Uni[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [edit, setEdit] = useState<{ id: number | null; f: typeof EMPTY } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ universities: Uni[] }>('/admin/universities').then((r) => setRows(r.universities));
  useEffect(() => { load(); api<Meta>('/meta').then(setMeta); }, []);

  async function save() {
    setBusy(true);
    try {
      const body = { ...edit!.f, short_name: edit!.f.short_name || null, website: edit!.f.website || null };
      if (edit!.id) await api(`/admin/universities/${edit!.id}`, { method: 'PUT', body });
      else await api('/admin/universities', { body });
      toast('บันทึกแล้ว'); setEdit(null); load();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }
  async function del(u: Uni) {
    if (!confirm(`ลบ "${u.uni_name}"? หลักสูตรทั้งหมด ${u.programs} หลักสูตรของมหาวิทยาลัยนี้จะถูกลบด้วย`)) return;
    try { await api(`/admin/universities/${u.uni_id}`, { method: 'DELETE' }); toast('ลบแล้ว'); load(); } catch (e) { toast((e as Error).message, 'err'); }
  }
  const set = (k: keyof typeof EMPTY, v: string) => setEdit({ ...edit!, f: { ...edit!.f, [k]: v } });

  return (
    <>
      <PageHeader title="จัดการข้อมูลมหาวิทยาลัย" action={<Button onClick={() => setEdit({ id: null, f: { ...EMPTY } })}>+ เพิ่มมหาวิทยาลัย</Button>} />
      <Card>
        {!rows ? <Loading /> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-5 py-2 font-medium">มหาวิทยาลัย</th><th className="py-2 font-medium">ภูมิภาค / จังหวัด</th><th className="py-2 font-medium">ประเภท</th><th className="py-2 text-right font-medium">หลักสูตร</th><th className="px-5 py-2"></th></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.uni_id} className="border-b border-line/60 last:border-0 hover:bg-stone-50">
                    <td className="px-5 py-2"><div className="font-medium">{u.uni_name}</div><div className="text-xs text-muted">{u.short_name} {u.website && `· ${u.website.replace(/^https?:\/\//, '')}`}</div></td>
                    <td className="py-2">{u.region}<div className="text-xs text-muted">{u.province}{u.lat != null && u.lng != null ? ` · ${u.lat}, ${u.lng}` : ' · ไม่มีพิกัด'}</div></td>
                    <td className="py-2"><Badge tone={u.type === 'รัฐ' ? 'brand' : 'gray'}>{u.type}</Badge></td>
                    <td className="num py-2 text-right">{u.programs}</td>
                    <td className="px-5 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: u.uni_id, f: { uni_name: u.uni_name, short_name: u.short_name ?? '', region: u.region, province: u.province ?? '', type: u.type, website: u.website ?? '', lat: String(u.lat ?? ''), lng: String(u.lng ?? '') } })}>แก้ไข</Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => del(u)}>ลบ</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'แก้ไขมหาวิทยาลัย' : 'เพิ่มมหาวิทยาลัย'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button><Button onClick={save} loading={busy}>บันทึก</Button></>}>
        {edit && (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="ชื่อมหาวิทยาลัย"><Input value={edit.f.uni_name} onChange={(e) => set('uni_name', e.target.value)} /></Field></div>
            <Field label="ชื่อย่อ"><Input value={edit.f.short_name} onChange={(e) => set('short_name', e.target.value)} /></Field>
            <Field label="ประเภท"><Select value={edit.f.type} onChange={(e) => set('type', e.target.value)}><option>รัฐ</option><option>เอกชน</option></Select></Field>
            <Field label="ภูมิภาค"><Select value={edit.f.region} onChange={(e) => set('region', e.target.value)}><option value="">— เลือก —</option>{meta?.regions.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="จังหวัด"><Select value={edit.f.province} onChange={(e) => set('province', e.target.value)}><option value="">— เลือก —</option>{meta?.provinces.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="ละติจูดของวิทยาเขต" hint="เว้นว่าง = วัดระยะทางจากตัวจังหวัด"><Input type="number" step="0.001" value={edit.f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="เช่น 16.748" /></Field>
            <Field label="ลองจิจูดของวิทยาเขต"><Input type="number" step="0.001" value={edit.f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="เช่น 100.193" /></Field>
            <div className="sm:col-span-2"><Field label="เว็บไซต์"><Input value={edit.f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field></div>
          </div>
        )}
      </Modal>
    </>
  );
}
