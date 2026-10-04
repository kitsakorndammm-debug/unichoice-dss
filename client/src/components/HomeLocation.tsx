import { lazy, Suspense, useMemo, useState } from 'react';
import type { Meta, Profile } from '../lib/types';
import { Field, Select, Spinner, cx, useToast } from './ui';

const HomeMap = lazy(() => import('./HomeMap'));

/** ระยะทางเส้นตรง (กม.) — สูตรเดียวกับฝั่งเซิร์ฟเวอร์ (server/src/geo.ts) */
function km(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

/** จังหวัดที่พิกัดใกล้ตำแหน่งนี้ที่สุด (ใช้แสดงผลและเป็นค่าสำรอง) */
function nearestProvince(lat: number, lng: number, coords: Meta['provinceCoords']): string | null {
  let best: string | null = null, bestD = Infinity;
  for (const [name, [plat, plng]] of Object.entries(coords)) {
    const d = (plat - lat) ** 2 + ((plng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

const GEO_ERR: Record<number, string> = {
  1: 'เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณากดอนุญาตที่แถบที่อยู่ หรือปักหมุดบนแผนที่แทน',
  2: 'หาตำแหน่งไม่ได้ในขณะนี้ กรุณาปักหมุดบนแผนที่หรือเลือกจังหวัดแทน',
  3: 'หาตำแหน่งนานเกินไป กรุณาลองใหม่ หรือปักหมุดบนแผนที่แทน',
};
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** ระบุที่อยู่ของผู้ใช้ได้ 3 ทาง: ตำแหน่งปัจจุบันของอุปกรณ์, ปักหมุดบนแผนที่, หรือเลือกจังหวัด — พร้อมบอกระยะถึงมหาวิทยาลัยที่ใกล้ที่สุด */
export function HomeLocation({ profile, meta, onChange }: { profile: Profile; meta: Meta; onChange: (patch: Partial<Profile>) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const exact = profile.home_lat != null && profile.home_lng != null;
  const home: [number, number] | null = exact ? [Number(profile.home_lat), Number(profile.home_lng)] : null;
  const centroid = profile.home_province ? meta.provinceCoords[profile.home_province] ?? null : null;
  const origin = home ?? centroid;

  const setPin = (lat: number, lng: number) => {
    const a = round3(lat), b = round3(lng);
    onChange({ home_lat: a, home_lng: b, home_province: nearestProvince(a, b, meta.provinceCoords) });
  };

  function locate() {
    if (!('geolocation' in navigator)) { toast('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง กรุณาปักหมุดบนแผนที่แทน', 'err'); return; }
    if (!window.isSecureContext) { toast('การระบุตำแหน่งใช้ได้เฉพาะเว็บที่เป็น https กรุณาปักหมุดบนแผนที่แทน', 'err'); setMapOpen(true); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPin(pos.coords.latitude, pos.coords.longitude); setBusy(false); setMapOpen(true); toast('ปักหมุดที่ตำแหน่งปัจจุบันแล้ว ลากหมุดเพื่อปรับได้'); },
      (err) => { setBusy(false); setMapOpen(true); toast(GEO_ERR[err.code] ?? 'ระบุตำแหน่งไม่สำเร็จ', 'err'); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  // มหาวิทยาลัยที่ใกล้ที่สุด 3 แห่งจากจุดที่ใช้วัด (หมุด หรือ ตัวจังหวัด)
  const nearest = useMemo(() => {
    if (!origin) return [];
    return meta.universities.filter((u) => u.lat != null && u.lng != null)
      .map((u) => ({ id: u.uni_id, name: u.short_name || u.uni_name, km: km(origin, [Number(u.lat), Number(u.lng)]) }))
      .sort((a, b) => a.km - b.km).slice(0, 3);
  }, [origin?.[0], origin?.[1], meta.universities]);

  const chip = 'inline-flex min-h-9 items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition disabled:opacity-60 sm:min-h-0 sm:px-2 sm:text-[11px]';
  return (
    <div>
      <Field label="ที่อยู่ของคุณ (บ้าน)">
        <Select value={profile.home_province ?? ''} onChange={(e) => onChange({ home_province: e.target.value || null, home_lat: null, home_lng: null })}>
          <option value="">— ยังไม่ระบุ —</option>{meta.provinces.map((r) => <option key={r}>{r}</option>)}
        </Select>
      </Field>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={locate} disabled={busy} className={cx(chip, 'bg-brand-50 text-brand-700 hover:bg-brand-600 hover:text-white')}>
          {busy ? <Spinner className="h-3 w-3" /> : <span aria-hidden>◎</span>}ใช้ตำแหน่งปัจจุบัน
        </button>
        <button type="button" onClick={() => setMapOpen(!mapOpen)} aria-expanded={mapOpen} className={cx(chip, mapOpen ? 'bg-brand-600 text-white' : 'bg-stone-100 text-ink-2 hover:bg-stone-200')}>
          <span aria-hidden>⌖</span>{mapOpen ? 'ซ่อนแผนที่' : 'ปักหมุดบนแผนที่'}
        </button>
      </div>

      {mapOpen && (
        <div className="mt-2">
          <Suspense fallback={<div className="grid h-56 place-items-center rounded-xl bg-stone-100 text-xs text-muted sm:h-64"><span className="flex items-center gap-2"><Spinner className="h-4 w-4" />กำลังโหลดแผนที่...</span></div>}>
            <HomeMap home={home} fallback={centroid} universities={meta.universities} onPick={setPin} />
          </Suspense>
          <p className="mt-1 text-[11px] text-muted">แตะบนแผนที่เพื่อปักหมุดบ้าน หรือลากหมุดเพื่อย้าย · จุดสีเทาคือมหาวิทยาลัยในระบบ</p>
        </div>
      )}

      <div className="mt-1.5 text-[11px] leading-relaxed">
        {exact ? (
          <span className="text-emerald-700">● วัดจากหมุดของคุณ ({profile.home_lat}, {profile.home_lng}){profile.home_province ? ` · ${profile.home_province}` : ''}
            <button type="button" className="ml-2 inline-flex min-h-8 items-center text-muted underline hover:text-ink sm:min-h-0" onClick={() => onChange({ home_lat: null, home_lng: null })}>ใช้แค่จังหวัด</button>
          </span>
        ) : (
          <span className="text-muted">{profile.home_province ? 'วัดจากตัวจังหวัดถึงมหาวิทยาลัย (ปักหมุดเพื่อให้แม่นขึ้น)' : 'ยังไม่ระบุ: เกณฑ์ “ความใกล้บ้าน” จะดูแค่ภูมิภาคที่สนใจ'}</span>
        )}
      </div>

      {nearest.length > 0 && (
        <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-xs">
          <div className="text-muted">มหาวิทยาลัยที่ใกล้{exact ? 'หมุดของคุณ' : 'ตัวจังหวัด'}ที่สุด (เส้นตรง)</div>
          <ul className="mt-1 space-y-0.5">
            {nearest.map((u) => (
              <li key={u.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-ink">{u.name}</span>
                <span className="num shrink-0 font-medium text-ink">{u.km.toLocaleString('th-TH')} กม.</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
