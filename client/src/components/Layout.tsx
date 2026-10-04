import type { ReactNode } from 'react';
import { useStore } from '../lib/store';
import { useRoute, Link } from '../lib/router';
import { cx } from './ui';

const I = {
  analyze: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  programs: 'M3 7l9-4 9 4-9 4-9-4zm3 2.5V15c0 1.5 2.7 3 6 3s6-1.5 6-3V9.5',
  compare: 'M8 4v16M16 4v16M4 8h4M4 16h4M16 12h4',
  saved: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  uni: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5',
  criteria: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6',
};
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, compare } = useStore();
  const { path } = useRoute();
  const nav = user?.role === 'admin'
    ? [
        { to: '/admin', label: 'แดชบอร์ด', icon: I.dashboard },
        { to: '/admin/programs', label: 'หลักสูตร', icon: I.programs },
        { to: '/admin/universities', label: 'มหาวิทยาลัย', icon: I.uni },
        { to: '/admin/criteria', label: 'เกณฑ์การประเมิน', icon: I.criteria },
        { to: '/admin/users', label: 'ผู้ใช้งาน', icon: I.users },
      ]
    : [
        { to: '/analyze', label: 'วิเคราะห์และจัดอันดับ', icon: I.analyze },
        { to: '/programs', label: 'ค้นหาหลักสูตร', icon: I.programs },
        { to: '/compare', label: 'เปรียบเทียบ', icon: I.compare, badge: compare.length || undefined },
        { to: '/saved', label: 'รายการโปรด', icon: I.saved },
        { to: '/history', label: 'ประวัติการประเมิน', icon: I.history },
        { to: '/profile', label: 'โปรไฟล์ของฉัน', icon: I.profile },
      ];
  const active = (to: string) => (to === '/admin' ? path === '/admin' : path === to || path.startsWith(to + '/'));

  return (
    <div className="min-h-full lg:pl-64">
      <aside className="z-30 border-b border-line bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2.5 px-5 py-4">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 16l4-5 3 2.5 5-7" /></svg>
            </div>
            <div className="leading-tight">
              <div className="font-semibold tracking-tight">UniChoice DSS</div>
              <div className="text-[11px] text-muted">ช่วยตัดสินใจเลือกคณะ/มหาวิทยาลัย</div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {nav.map((n) => (
              <Link key={n.to} to={n.to}
                className={cx('flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition',
                  active(n.to) ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-2 hover:bg-black/[0.04] hover:text-ink')}>
                <Icon d={n.icon} />
                <span className="flex-1">{n.label}</span>
                {'badge' in n && n.badge ? <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{n.badge}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="hidden border-t border-line p-4 lg:block">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-sm font-semibold text-ink-2">{user?.name.slice(0, 1)}</div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium">{user?.name}</div>
                <div className="text-[11px] text-muted">{user?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'นักเรียน/ผู้สมัคร'}</div>
              </div>
              <button onClick={logout} className="rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-black/5" title="ออกจากระบบ">ออก</button>
            </div>
          </div>
        </div>
      </aside>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
