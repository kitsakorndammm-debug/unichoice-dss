import { useEffect, type ReactElement } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { useRoute, match, navigate } from './lib/router';
import { ToastProvider, Loading } from './components/ui';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Analyze from './pages/Analyze';
import Programs from './pages/Programs';
import ProgramDetail from './pages/ProgramDetail';
import Compare from './pages/Compare';
import Saved from './pages/Saved';
import History from './pages/History';
import RunDetail from './pages/RunDetail';
import ProfilePage from './pages/Profile';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminPrograms from './pages/admin/AdminPrograms';
import AdminUniversities from './pages/admin/AdminUniversities';
import AdminCriteria from './pages/admin/AdminCriteria';
import AdminUsers from './pages/admin/AdminUsers';

const studentRoutes: [string, (p: Record<string, string>) => ReactElement][] = [
  ['/analyze', () => <Analyze />],
  ['/programs', () => <Programs />],
  ['/programs/:id', (p) => <ProgramDetail id={Number(p.id)} />],
  ['/compare', () => <Compare />],
  ['/saved', () => <Saved />],
  ['/history', () => <History />],
  ['/history/:id', (p) => <RunDetail id={Number(p.id)} />],
  ['/profile', () => <ProfilePage />],
];
const adminRoutes: [string, (p: Record<string, string>) => ReactElement][] = [
  ['/admin', () => <AdminDashboard />],
  ['/admin/programs', () => <AdminPrograms />],
  ['/admin/universities', () => <AdminUniversities />],
  ['/admin/criteria', () => <AdminCriteria />],
  ['/admin/users', () => <AdminUsers />],
  ['/history/:id', (p) => <RunDetail id={Number(p.id)} />],
];

function Routes() {
  const { user, ready } = useStore();
  const { path } = useRoute();
  const home = user?.role === 'admin' ? '/admin' : '/analyze';

  useEffect(() => {
    if (!ready) return;
    if (!user && path !== '/login') navigate('/login');
    else if (user && (path === '/login' || path === '/')) navigate(home);
  }, [ready, user, path, home]);

  if (!ready) return <Loading />;
  if (!user || path === '/login') return <Login />;
  const table = user.role === 'admin' ? adminRoutes : studentRoutes;
  for (const [pattern, render] of table) {
    const params = match(pattern, path);
    if (params) return <Layout>{render(params)}</Layout>;
  }
  return <Layout><div className="py-20 text-center text-muted">ไม่พบหน้านี้ · <a className="text-brand-600 underline" href={'#' + home}>กลับหน้าหลัก</a></div></Layout>;
}

export default function App() {
  return <StoreProvider><ToastProvider><Routes /></ToastProvider></StoreProvider>;
}
