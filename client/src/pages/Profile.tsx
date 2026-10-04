import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import type { Meta, Profile, User } from '../lib/types';
import { HomeLocation } from '../components/HomeLocation';
import { SubjectScores } from '../components/SubjectScores';
import { Button, Card, Field, Input, Loading, PageHeader, Select, useToast } from '../components/ui';

export default function ProfilePage() {
  const toast = useToast();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Meta>('/meta').then(setMeta);
    api<{ user: User; profile: Profile }>('/profile').then((r) => { setUser(r.user); setP(r.profile); });
  }, []);
  if (!p || !user || !meta) return <Loading />;
  const num = (v: string) => (v === '' ? null : Number(v));

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api('/profile', { method: 'PUT', body: { ...p, name: user!.name, phone: user!.phone ?? null } });
      toast('บันทึกโปรไฟล์แล้ว');
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="โปรไฟล์ของฉัน" sub="ข้อมูลนี้ใช้คำนวณโอกาสสอบติด คัดกรองงบประมาณ และพื้นที่" />
      <form onSubmit={save} className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <Card title="ข้อมูลบัญชี">
          <div className="space-y-3.5">
            <Field label="ชื่อ-นามสกุล"><Input value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} /></Field>
            <Field label="อีเมล"><Input value={user.email} disabled /></Field>
            <Field label="เบอร์โทรศัพท์"><Input value={user.phone ?? ''} onChange={(e) => setUser({ ...user, phone: e.target.value })} maxLength={15} /></Field>
          </div>
        </Card>
        <Card title="ข้อมูลการศึกษาและความต้องการ">
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="GPA สะสม" hint="0.00 – 4.00"><Input type="number" step="0.01" min={0} max={4} value={p.gpa ?? ''} onChange={(e) => setP({ ...p, gpa: num(e.target.value) })} /></Field>
            <Field label="คะแนนสอบ (%)" hint="TGAT/TPAT/A-Level คิดเป็นร้อยละ"><Input type="number" min={0} max={100} value={p.exam_score ?? ''} onChange={(e) => setP({ ...p, exam_score: num(e.target.value) })} /></Field>
            <div className="col-span-2"><SubjectScores profile={p} meta={meta} onChange={(patch) => setP({ ...p, ...patch })} /></div>
            <div className="col-span-2"><Field label="งบค่าเล่าเรียนต่อปี (บาท)" hint="ค่าเทอม × จำนวนเทอมต่อปี เช่น เทอมละ 17,100 สองเทอม = 34,200"><Input type="number" step="1000" min={0} value={p.budget ?? ''} onChange={(e) => setP({ ...p, budget: num(e.target.value) })} /></Field></div>
            <div className="col-span-2"><HomeLocation profile={p} meta={meta} onChange={(patch) => setP({ ...p, ...patch })} /></div>
            <Field label="ภูมิภาคที่สนใจ"><Select value={p.preferred_region ?? 'ทั้งหมด'} onChange={(e) => setP({ ...p, preferred_region: e.target.value })}><option>ทั้งหมด</option>{meta.regions.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="สาขาที่สนใจ"><Select value={p.interest_field ?? 'ทั้งหมด'} onChange={(e) => setP({ ...p, interest_field: e.target.value })}><option>ทั้งหมด</option>{meta.fields.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          </div>
        </Card>
        <div className="flex gap-2 lg:col-span-2">
          <Button type="submit" loading={busy}>บันทึกโปรไฟล์</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/analyze')}>ไปหน้าวิเคราะห์ →</Button>
        </div>
      </form>
    </>
  );
}
