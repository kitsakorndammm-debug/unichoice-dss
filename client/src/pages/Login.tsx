import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { navigate } from '../lib/router';
import type { User } from '../lib/types';
import { Button, Field, Input, cx } from '../components/ui';

export default function Login() {
  const { login } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: FormEvent, override?: { email: string; password: string }) {
    e?.preventDefault();
    setErr(''); setBusy(true);
    try {
      const body = override ?? (mode === 'login' ? { email: f.email, password: f.password } : f);
      const r = await api<{ token: string; user: User }>(override || mode === 'login' ? '/auth/login' : '/auth/register', { body });
      login(r.token, r.user);
      navigate(r.user.role === 'admin' ? '/admin' : mode === 'register' && !override ? '/profile' : '/analyze');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-[28rem] w-[28rem] rounded-full bg-white/5" />
        <div className="relative flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 16l4-5 3 2.5 5-7" /></svg>
          </div>
          <span className="text-lg font-semibold">UniChoice DSS</span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight">เลือกคณะและมหาวิทยาลัย<br />ด้วยข้อมูล ไม่ใช่ความรู้สึก</h1>
          <p className="mt-4 text-white/75">กำหนดเองว่าอะไรสำคัญกับคุณ ระบบจะคัดกรอง ประเมินความเสี่ยง และจัดอันดับหลักสูตรด้วยวิธี Simple Additive Weighting (SAW) แบบเรียลไทม์</p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
            {[['1', 'จัดการข้อมูล', '2,200+ หลักสูตร 39 มหาวิทยาลัย'], ['2', 'แบบจำลอง SAW', 'คัดกรอง + ความเสี่ยง'], ['3', 'แดชบอร์ด', 'กราฟเรียลไทม์']].map(([n, t, s]) => (
              <div key={n} className="rounded-xl bg-white/10 p-3">
                <div className="text-xs text-white/60">ส่วนที่ {n}</div>
                <div className="mt-1 font-medium">{t}</div>
                <div className="text-xs text-white/60">{s}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-white/50">ภาควิชาวิทยาการคอมพิวเตอร์และเทคโนโลยีสารสนเทศ คณะวิทยาศาสตร์ มหาวิทยาลัยนเรศวร</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">{mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</h2>
          <p className="mt-1 text-sm text-ink-2">{mode === 'login' ? 'ยินดีต้อนรับกลับ' : 'สร้างบัญชีเพื่อเริ่มวิเคราะห์'}</p>

          <div className="mt-6 grid grid-cols-2 rounded-lg bg-stone-200/60 p-1 text-sm">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setErr(''); }} className={cx('rounded-md py-1.5 transition', mode === m ? 'bg-white font-medium shadow-sm' : 'text-ink-2')}>
                {m === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {mode === 'register' && <Field label="ชื่อ-นามสกุล"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>}
            <Field label="อีเมล"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" /></Field>
            <Field label="รหัสผ่าน" hint={mode === 'register' ? 'อย่างน้อย 6 ตัวอักษร' : undefined}>
              <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </Field>
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <Button type="submit" loading={busy} className="w-full">{mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</Button>
          </form>

          <div className="mt-8 rounded-xl border border-dashed border-black/15 p-4">
            <div className="text-xs font-medium text-ink-2">บัญชีทดลอง (สำหรับสาธิต)</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => submit(undefined, { email: 'student@dss.local', password: 'student1234' })}>นักเรียน</Button>
              <Button variant="secondary" size="sm" onClick={() => submit(undefined, { email: 'admin@dss.local', password: 'admin1234' })}>ผู้ดูแลระบบ</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
