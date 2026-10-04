import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { colorFor } from '../../lib/format';
import type { Criteria } from '../../lib/types';
import { Button, Card, Input, Loading, PageHeader, Select, Toggle, cx, useToast } from '../../components/ui';

export default function AdminCriteria() {
  const toast = useToast();
  const [rows, setRows] = useState<Criteria[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ criteria: Criteria[] }>('/admin/criteria').then((r) => setRows(r.criteria)); }, []);
  if (!rows) return <Loading />;
  const total = rows.filter((r) => r.is_active).reduce((s, r) => s + Number(r.default_weight), 0);
  const set = (id: number, patch: Partial<Criteria>) => setRows(rows.map((r) => (r.criteria_id === id ? { ...r, ...patch } : r)));

  async function saveAll() {
    if (Math.round(total) !== 100) { toast('น้ำหนักเริ่มต้นของเกณฑ์ที่เปิดใช้ต้องรวมเป็น 100%', 'err'); return; }
    setBusy(true);
    try {
      for (const r of rows!) await api(`/admin/criteria/${r.criteria_id}`, { method: 'PUT', body: { criteria_name: r.criteria_name, type: r.type, description: r.description, default_weight: Number(r.default_weight), is_active: r.is_active } });
      toast('บันทึกเกณฑ์แล้ว');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="เกณฑ์การประเมินมาตรฐานกลาง" sub="กำหนดชื่อ ประเภท (Benefit/Cost) น้ำหนักเริ่มต้น และเปิด/ปิดเกณฑ์ที่ใช้ใน SAW"
        action={<Button onClick={saveAll} loading={busy}>บันทึกการเปลี่ยนแปลง</Button>} />
      <Card action={<span className={cx('num rounded-full px-2 py-0.5 text-xs font-semibold', Math.round(total) === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>น้ำหนักเริ่มต้นรวม {total}%</span>} title="รายการเกณฑ์">
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.criteria_id} className={cx('grid items-center gap-3 rounded-xl p-3 ring-1 ring-black/[0.07] md:grid-cols-[1.4fr_2fr_120px_110px_150px]', !r.is_active && 'opacity-60')}>
              <div className="flex items-center gap-2.5"><span className="h-3 w-3 rounded-[3px]" style={{ background: colorFor(r.code) }} /><div><Input value={r.criteria_name} onChange={(e) => set(r.criteria_id, { criteria_name: e.target.value })} /><div className="mt-0.5 text-[11px] text-muted">code: {r.code}</div></div></div>
              <Input value={r.description ?? ''} onChange={(e) => set(r.criteria_id, { description: e.target.value })} placeholder="คำอธิบาย" />
              <Select value={r.type} onChange={(e) => set(r.criteria_id, { type: e.target.value as 'benefit' | 'cost' })}><option value="benefit">Benefit</option><option value="cost">Cost</option></Select>
              <div className="flex items-center gap-1.5"><Input type="number" min={0} max={100} value={r.default_weight} onChange={(e) => set(r.criteria_id, { default_weight: Number(e.target.value) })} /><span className="text-sm text-muted">%</span></div>
              <Toggle checked={r.is_active} onChange={(v) => set(r.criteria_id, { is_active: v })} label={r.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Normalization: Benefit = ค่า ÷ ค่าสูงสุด · Cost = ค่าต่ำสุด ÷ ค่า · การแก้ไขจะล้างแคชผลการคำนวณอัตโนมัติ</p>
      </Card>
    </>
  );
}
