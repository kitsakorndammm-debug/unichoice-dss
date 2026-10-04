// กราฟทั้งหมดเขียนด้วย SVG/HTML ล้วน (ไม่ต้องพึ่งไลบรารี) — มี tooltip เมื่อชี้ และ legend เมื่อมีหลายชุดข้อมูล
import { useEffect, useRef, useState, type ReactNode } from 'react';

const INK2 = '#52514e', MUTED = '#898781', GRID = '#e1e0d9', AXIS = '#c3c2b7';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Tip = { x: number; y: number; content: ReactNode } | null;
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.MouseEvent, content: ReactNode) => {
    const r = box.current!.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, content });
  };
  const el = tip && (
    <div className="pointer-events-none absolute z-20 min-w-[140px] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/10"
      style={{ left: tip.x, top: tip.y }}>{tip.content}</div>
  );
  return { box, show, hide: () => setTip(null), el };
}

export const TipRow = ({ color, label, value }: { color?: string; label: ReactNode; value: ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-0.5">
    <span className="flex items-center gap-1.5 text-ink-2">{color && <span className="h-2 w-2 rounded-sm" style={{ background: color }} />}{label}</span>
    <span className="num font-medium text-ink">{value}</span>
  </div>
);

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}

// ---------- แท่งซ้อนแนวนอน: คะแนน SAW แยกตามเกณฑ์ ----------
export interface StackRow { id: number | string; label: ReactNode; sub?: ReactNode; total: number; segments: { key: string; label: string; value: number; color: string; note?: string }[]; highlight?: boolean; onClick?: () => void }

export function StackedBars({ rows, max = 100, unit = '' }: { rows: StackRow[]; max?: number; unit?: string }) {
  const t = useTip();
  return (
    <div ref={t.box} className="relative" onMouseLeave={t.hide}>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.id} className={`grid grid-cols-[150px_1fr_44px] sm:grid-cols-[190px_1fr_48px] items-center gap-3 ${r.onClick ? 'cursor-pointer' : ''}`} onClick={r.onClick}>
            <div className="min-w-0 text-right leading-tight">
              <div className={`truncate text-[13px] ${r.highlight ? 'font-semibold text-ink' : 'text-ink'}`}>{r.label}</div>
              {r.sub && <div className="truncate text-[11px] text-muted">{r.sub}</div>}
            </div>
            <div className="flex h-5 items-stretch gap-[2px]">
              {r.segments.filter((s) => s.value > 0).map((s, i, arr) => (
                <div key={s.key}
                  className={`transition-[width] duration-300 hover:brightness-110 ${i === arr.length - 1 ? 'rounded-r-[4px]' : ''}`}
                  style={{ width: `${(s.value / max) * 100}%`, background: s.color }}
                  onMouseMove={(e) => t.show(e, <>
                    <div className="mb-1 font-medium text-ink">{r.label}</div>
                    <TipRow color={s.color} label={s.label} value={`${s.value.toFixed(2)}${unit}`} />
                    {s.note && <div className="mt-0.5 text-[11px] text-muted">{s.note}</div>}
                    <div className="mt-1 border-t border-line pt-1"><TipRow label="รวม" value={`${r.total.toFixed(2)}${unit}`} /></div>
                  </>)} />
              ))}
            </div>
            <div className="num text-right text-[13px] font-semibold text-ink">{r.total.toFixed(1)}</div>
          </div>
        ))}
      </div>
      {t.el}
    </div>
  );
}

// ---------- แท่งแนวนอนชุดเดียว ----------
export function BarList({ items, color = '#2a78d6', format = (v: number) => String(v), max }: { items: { label: ReactNode; value: number; sub?: ReactNode }[]; color?: string; format?: (v: number) => string; max?: number }) {
  const t = useTip();
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div ref={t.box} className="relative space-y-2" onMouseLeave={t.hide}>
      {items.map((it, i) => (
        <div key={i} className="group" onMouseMove={(e) => t.show(e, <TipRow color={color} label={it.label} value={format(it.value)} />)}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate text-ink">{it.label}{it.sub && <span className="ml-1.5 text-xs text-muted">{it.sub}</span>}</span>
            <span className="num shrink-0 text-ink-2">{format(it.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-stone-100">
            <div className="h-2 rounded-r-[4px] rounded-l-full transition-[width] duration-300 group-hover:brightness-110" style={{ width: `${(it.value / m) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
      {t.el}
    </div>
  );
}

// ---------- เรดาร์ (เปรียบเทียบคะแนน normalized รายเกณฑ์) ----------
export function Radar({ axes, series, size = 300 }: { axes: string[]; series: { name: string; color: string; values: number[]; dashed?: boolean }[]; size?: number }) {
  const t = useTip();
  const c = size / 2, R = size / 2 - 58, n = axes.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v];
  };
  if (n < 3) return <div className="text-sm text-muted">ต้องมีอย่างน้อย 3 เกณฑ์</div>;
  return (
    <div ref={t.box} className="relative mx-auto" style={{ maxWidth: size }} onMouseLeave={t.hide}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full overflow-visible">
        {[0.25, 0.5, 0.75, 1].map((lv) => (
          <polygon key={lv} points={axes.map((_, i) => pt(i, lv).join(',')).join(' ')} fill="none" stroke={GRID} strokeWidth={1} />
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 1);
          const [lx, ly] = pt(i, 1.22);
          return (
            <g key={a}>
              <line x1={c} y1={c} x2={x} y2={y} stroke={GRID} />
              <text x={lx} y={ly} fontSize={11} fill={INK2} textAnchor={Math.abs(lx - c) < 8 ? 'middle' : lx > c ? 'start' : 'end'} dominantBaseline="middle">{a}</text>
            </g>
          );
        })}
        {series.map((s) => (
          <g key={s.name}>
            <polygon points={s.values.map((v, i) => pt(i, v).join(',')).join(' ')} fill={s.color} fillOpacity={s.dashed ? 0 : 0.12} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinejoin="round" />
            {s.values.map((v, i) => {
              const [x, y] = pt(i, v);
              return <circle key={i} cx={x} cy={y} r={4} fill={s.color} stroke="#fff" strokeWidth={2}
                onMouseMove={(e) => t.show(e, <><div className="mb-0.5 font-medium text-ink">{axes[i]}</div><TipRow color={s.color} label={s.name} value={v.toFixed(3)} /></>)} />;
            })}
          </g>
        ))}
      </svg>
      {series.length > 1 && <div className="mt-2 flex justify-center"><Legend items={series.map((s) => ({ label: s.name, color: s.color }))} /></div>}
      {t.el}
    </div>
  );
}

// ---------- กราฟเส้น/พื้นที่ ตามวัน ----------
export function AreaLine({ data, color = '#2a78d6', height = 200, label = 'ค่า' }: { data: { x: string; y: number }[]; color?: string; height?: number; label?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 32, r: 12, t: 12, b: 26 };
  const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
  const maxY = Math.max(1, ...data.map((d) => d.y));
  const niceMax = Math.ceil(maxY / 2) * 2 || 2;
  const x = (i: number) => pad.l + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2);
  const y = (v: number) => pad.t + ih - (v / niceMax) * ih;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.y)}`).join('');
  const area = `${line}L${x(data.length - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z`;
  const ticks = [0, niceMax / 2, niceMax];
  const fmt = (s: string) => new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} stroke={tk === 0 ? AXIS : GRID} />
            <text x={pad.l - 8} y={y(tk)} fontSize={11} fill={MUTED} textAnchor="end" dominantBaseline="middle" className="num">{tk}</text>
          </g>
        ))}
        <path d={area} fill={color} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (i % Math.ceil(data.length / 7) === 0 || i === data.length - 1) && (
          <text key={d.x} x={x(i)} y={height - 8} fontSize={11} fill={MUTED} textAnchor="middle">{fmt(d.x)}</text>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={AXIS} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].y)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/10"
          style={{ left: x(hover), top: Math.max(0, y(data[hover].y) - 56) }}>
          <div className="font-medium text-ink">{fmt(data[hover].x)}</div>
          <TipRow color={color} label={label} value={data[hover].y} />
        </div>
      )}
    </div>
  );
}

// ---------- โดนัท ----------
export function Donut({ data, size = 160, center }: { data: { label: string; value: number; color: string }[]; size?: number; center?: ReactNode }) {
  const t = useTip();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - 10, sw = 22, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div ref={t.box} className="relative flex flex-wrap items-center gap-5" onMouseLeave={t.hide}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0efec" strokeWidth={sw} />
          {data.map((d) => {
            const len = (d.value / total) * C;
            const el = (
              <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={sw}
                strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} className="transition hover:opacity-80"
                onMouseMove={(e) => t.show(e, <TipRow color={d.color} label={d.label} value={`${d.value} (${Math.round((d.value / total) * 100)}%)`} />)} />
            );
            acc += len;
            return el;
          })}
        </svg>
        {center && <div className="absolute inset-0 grid place-items-center text-center">{center}</div>}
      </div>
      <div className="space-y-1.5 text-xs">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: d.color }} />
            <span className="text-ink-2">{d.label}</span>
            <span className="num font-medium text-ink">{d.value}</span>
          </div>
        ))}
      </div>
      {t.el}
    </div>
  );
}

// ---------- มาตรวัดครึ่งวงกลม (โอกาสสอบติด) ----------
export function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 70, C = Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={104} viewBox="0 0 180 104">
        <path d="M20,94 A70,70 0 0 1 160,94" fill="none" stroke="#f0efec" strokeWidth={14} strokeLinecap="round" />
        <path d="M20,94 A70,70 0 0 1 160,94" fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={`${(value / 100) * C} ${C}`} className="transition-[stroke-dasharray] duration-500" />
        <text x={90} y={82} textAnchor="middle" fontSize={28} fontWeight={600} fill="#0b0b0b">{Math.round(value)}%</text>
      </svg>
      <div className="-mt-1 text-xs text-ink-2">{label}</div>
    </div>
  );
}
