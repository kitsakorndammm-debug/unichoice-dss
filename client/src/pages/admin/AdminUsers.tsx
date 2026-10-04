import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { baht, fmtDate } from '../../lib/format';
import { Badge, Card, Loading, PageHeader } from '../../components/ui';

export default function AdminUsers() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api<{ users: any[] }>('/admin/users').then((r) => setRows(r.users)); }, []);
  return (
    <>
      <PageHeader title="ผู้ใช้งานระบบ" sub="บัญชีนักเรียนและผู้ดูแลระบบ พร้อมข้อมูลโปรไฟล์" />
      <Card>
        {!rows ? <Loading /> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-5 py-2 font-medium">ชื่อ</th><th className="py-2 font-medium">บทบาท</th><th className="py-2 text-right font-medium">GPA</th><th className="py-2 text-right font-medium">คะแนนสอบ</th><th className="py-2 font-medium">ภูมิภาค / สาขาที่สนใจ</th><th className="py-2 text-right font-medium">ประเมิน</th><th className="px-5 py-2 font-medium">สมัครเมื่อ</th></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.user_id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2"><div className="font-medium">{u.name}</div><div className="text-xs text-muted">{u.email}</div></td>
                    <td className="py-2"><Badge tone={u.role === 'admin' ? 'brand' : 'gray'}>{u.role === 'admin' ? 'ผู้ดูแล' : 'นักเรียน'}</Badge></td>
                    <td className="num py-2 text-right">{u.gpa ?? '-'}</td><td className="num py-2 text-right">{u.exam_score != null ? `${baht(u.exam_score)}%` : '-'}</td>
                    <td className="py-2 text-ink-2">{u.preferred_region ?? '-'} / {u.interest_field ?? '-'}</td>
                    <td className="num py-2 text-right">{u.runs}</td><td className="px-5 py-2 text-ink-2">{fmtDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
