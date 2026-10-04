const TOKEN_KEY = 'dss_token';

export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const t = token.get();
  const res = await fetch('/api' + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const isJson = res.headers.get('content-type')?.includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && t) onUnauthorized();
    throw new ApiError(res.status, (isJson && (data as any).error) || `เกิดข้อผิดพลาด (${res.status})`);
  }
  return data as T;
}

export async function download(path: string, filename: string) {
  const res = await fetch('/api' + path, { headers: { Authorization: `Bearer ${token.get()}` } });
  if (!res.ok) throw new ApiError(res.status, 'ดาวน์โหลดไม่สำเร็จ');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const reportUrl = (runId: number) => `/api/reports/${runId}/export?token=${encodeURIComponent(token.get() ?? '')}`;
