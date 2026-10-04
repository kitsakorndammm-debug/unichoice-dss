import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore, MAX_COMPARE } from '../lib/store';
import { Link } from '../lib/router';
import { baht, fmtDate } from '../lib/format';
import type { Program } from '../lib/types';
import { Badge, Button, Card, Empty, Loading, PageHeader, useToast } from '../components/ui';

type SavedRow = Program & { save_id: number; saved_date: string; note: string | null };

export default function Saved() {
  const toast = useToast();
  const { compare, toggleCompare } = useStore();
  const [rows, setRows] = useState<SavedRow[] | null>(null);
  useEffect(() => { api<{ saved: SavedRow[] }>('/saved-list').then((r) => setRows(r.saved)); }, []);

  async function remove(id: number) {
    await api(`/saved-list/${id}`, { method: 'DELETE' });
    setRows((r) => r!.filter((x) => x.program_id !== id));
    toast('นำออกจากรายการโปรดแล้ว');
  }
  function compareAll() {
    rows!.slice(0, MAX_COMPARE).forEach((r) => { if (!compare.includes(r.program_id)) toggleCompare(r.program_id); });
    window.location.hash = '/compare';
  }

  return (
    <>
      <PageHeader title="รายการโปรด (Shortlist)" sub="หลักสูตรที่คุณบันทึกไว้พิจารณา" action={rows && rows.length > 1 && <Button onClick={compareAll}>เปรียบเทียบรายการโปรด</Button>} />
      {!rows ? <Loading /> : rows.length === 0 ? <Card><Empty title="ยังไม่มีรายการโปรด" icon="♡">กดรูปหัวใจในหน้าวิเคราะห์หรือหน้าหลักสูตรเพื่อบันทึก</Empty></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <Card key={p.program_id}>
              <div className="flex gap-1.5"><Badge tone="brand">{p.field}</Badge><Badge>{p.region}</Badge></div>
              <Link to={`/programs/${p.program_id}`} className="mt-2 block font-semibold hover:text-brand-700">{p.program_name}</Link>
              <div className="text-sm text-ink-2">{p.uni_name}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-stone-50 p-2"><div className="text-muted">ค่าเทอม/เทอม</div><div className="num font-semibold text-ink">{baht(p.tuition_fee)}</div></div>
                <div className="rounded-lg bg-stone-50 p-2"><div className="text-muted">อันดับมหาวิทยาลัย</div><div className="num font-semibold text-ink">#{p.ranking}</div></div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span>บันทึกเมื่อ {fmtDate(p.saved_date)}</span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant={compare.includes(p.program_id) ? 'primary' : 'secondary'} onClick={() => toggleCompare(p.program_id)}>{compare.includes(p.program_id) ? '✓ เทียบ' : '+ เทียบ'}</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(p.program_id)}>ลบ</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
