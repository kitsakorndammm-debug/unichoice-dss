import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, token, setUnauthorizedHandler } from './api';
import type { User } from './types';
import { evalSession } from './session';

interface Store {
  user: User | null;
  ready: boolean;
  login: (t: string, u: User) => void;
  logout: () => void;
  compare: number[];
  toggleCompare: (id: number) => void;
  clearCompare: () => void;
}
const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);
export const MAX_COMPARE = 4;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [compare, setCompare] = useState<number[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('dss_compare') || '[]'); } catch { return []; }
  });

  // ออกจากระบบแล้วล้างรายการเทียบและสถานะหน้าวิเคราะห์ ไม่ให้ผู้ใช้คนถัดไปเห็นของคนก่อน
  const logout = useCallback(() => { token.set(null); setUser(null); setCompare([]); evalSession.clear(); window.location.hash = '/login'; }, []);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => {
    if (!token.get()) { setReady(true); return; }
    api<{ user: User }>('/auth/me').then((r) => setUser(r.user)).catch(() => token.set(null)).finally(() => setReady(true));
  }, []);
  useEffect(() => { try { sessionStorage.setItem('dss_compare', JSON.stringify(compare)); } catch { /* ignore */ } }, [compare]);

  const login = (t: string, u: User) => { evalSession.clear(); setCompare([]); token.set(t); setUser(u); };
  const toggleCompare = (id: number) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_COMPARE ? c : [...c, id]));
  return <Ctx.Provider value={{ user, ready, login, logout, compare, toggleCompare, clearCompare: () => setCompare([]) }}>{children}</Ctx.Provider>;
}
