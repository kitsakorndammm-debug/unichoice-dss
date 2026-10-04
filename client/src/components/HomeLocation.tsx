import { useState } from 'react';
import type { Meta, Profile } from '../lib/types';
import { Field, Select, Spinner, useToast } from './ui';

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
  1: 'เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณากดอนุญาตที่แถบที่อยู่ หรือเลือกจังหวัดแทน',
  2: 'หาตำแหน่งไม่ได้ในขณะนี้ กรุณาเลือกจังหวัดแทน',
  3: 'หาตำแหน่งนานเกินไป กรุณาลองใหม่หรือเลือกจังหวัดแทน',
};

/** ระบุที่อยู่ของผู้ใช้: กดใช้ตำแหน่งปัจจุบัน (แม่นระดับ ~100 ม.) หรือเลือกจังหวัดเอง */
export function HomeLocation({ profile, meta, onChange }: { profile: Profile; meta: Meta; onChange: (patch: Partial<Profile>) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const exact = profile.home_lat != null && profile.home_lng != null;

  function locate() {
    if (!('geolocation' in navigator)) { toast('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง กรุณาเลือกจังหวัดแทน', 'err'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000, lng = Math.round(pos.coords.longitude * 1000) / 1000;
        onChange({ home_lat: lat, home_lng: lng, home_province: nearestProvince(lat, lng, meta.provinceCoords) });
        setBusy(false);
        toast('ใช้ตำแหน่งปัจจุบันแล้ว');
      },
      (err) => { setBusy(false); toast(GEO_ERR[err.code] ?? 'ระบุตำแหน่งไม่สำเร็จ', 'err'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div>
      <Field label="ที่อยู่ของคุณ (บ้าน)">
        <Select value={profile.home_province ?? ''} onChange={(e) => onChange({ home_province: e.target.value || null, home_lat: null, home_lng: null })}>
          <option value="">— ยังไม่ระบุ —</option>{meta.provinces.map((r) => <option key={r}>{r}</option>)}
        </Select>
      </Field>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <button type="button" onClick={locate} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 font-medium text-brand-700 transition hover:bg-brand-600 hover:text-white disabled:opacity-60">
          {busy ? <Spinner className="h-3 w-3" /> : <span aria-hidden>◎</span>}ใช้ตำแหน่งปัจจุบัน
        </button>
        {exact ? (
          <span className="text-emerald-700">● วัดจากตำแหน่งจริง ({profile.home_lat}, {profile.home_lng})
            <button type="button" className="ml-2 text-muted underline hover:text-ink" onClick={() => onChange({ home_lat: null, home_lng: null })}>ใช้แค่จังหวัด</button>
          </span>
        ) : (
          <span className="text-muted">{profile.home_province ? 'วัดจากตัวจังหวัดถึงมหาวิทยาลัย' : 'ยังไม่ระบุ: เกณฑ์ “ความใกล้บ้าน” จะดูแค่ภูมิภาคที่สนใจ'}</span>
        )}
      </div>
    </div>
  );
}
