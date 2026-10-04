import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ children, className, title, action, sub }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl bg-white ring-1 ring-black/[0.07] shadow-[0_1px_2px_#0000000a]', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h3 className="text-[15px] font-semibold text-ink">{title}</h3>}
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'primary', size = 'md', className, loading, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-white text-ink ring-1 ring-black/10 hover:bg-stone-50',
    ghost: 'text-ink-2 hover:bg-black/5',
    danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  };
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm', v[variant], className)}
      disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink ring-1 ring-black/10 placeholder:text-muted focus:ring-2 focus:ring-brand-500 outline-none transition';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(inputCls, className)} {...p} />;
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(inputCls, 'pr-8', className)} {...p}>{children}</select>;

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-stone-300')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <span className="text-sm leading-tight">
        <span className="text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Badge({ children, className, tone = 'gray' }: { children: ReactNode; className?: string; tone?: 'gray' | 'brand' | 'red' | 'amber' | 'green' }) {
  const t = { gray: 'bg-stone-100 text-ink-2 ring-black/5', brand: 'bg-brand-50 text-brand-700 ring-brand-500/20', red: 'bg-red-50 text-red-700 ring-red-600/15', amber: 'bg-amber-50 text-amber-800 ring-amber-600/20', green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap', t, className)}>{children}</span>;
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.07]">
      <div className="flex items-center gap-2 text-xs text-ink-2">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}{label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export const Spinner = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);

export const Loading = ({ text = 'กำลังโหลด...' }: { text?: string }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Spinner /> {text}</div>
);

export function Empty({ title, children, icon = '◎' }: { title: string; children?: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-xl text-brand-600">{icon}</div>
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={cx('fade-up w-full rounded-2xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-black/5" aria-label="ปิด">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toast ----------
type ToastMsg = { id: number; text: string; tone: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cx('fade-up pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white shadow-lg', t.tone === 'ok' ? 'bg-ink' : 'bg-red-600')}>
            <span>{t.tone === 'ok' ? '✓' : '!'}</span>{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
