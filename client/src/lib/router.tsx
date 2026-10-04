// Router แบบ hash (#/path?query) ขนาดเล็ก ไม่ต้องตั้งค่าเซิร์ฟเวอร์เพิ่ม
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

function read() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

export function useRoute() {
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => { setR(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const navigate = (to: string) => { window.location.hash = to; };

/** จับคู่ path กับ pattern เช่น /programs/:id */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean), b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={'#' + to} onClick={(e: MouseEvent<HTMLAnchorElement>) => onClick?.(e)} {...rest} />;
}
