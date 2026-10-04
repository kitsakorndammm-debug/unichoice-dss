import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Meta } from '../lib/types';

const THAILAND: [number, number] = [13.4, 101.0];
const pin = (cls: string, size: number) => L.divIcon({ className: '', html: `<span class="${cls}"></span>`, iconSize: [size, size], iconAnchor: [size / 2, size] });
const HOME_ICON = pin('home-pin', 30);

/**
 * แผนที่ปักหมุดบ้าน: แตะบนแผนที่หรือลากหมุดเพื่อย้ายตำแหน่ง จุดสีเทาคือมหาวิทยาลัยในระบบ
 * โหลดแบบ lazy (ดู HomeLocation) เพราะไลบรารีแผนที่มีขนาดใหญ่และไม่ได้ใช้ทุกครั้ง
 */
export default function HomeMap({ home, fallback, universities, onPick }: {
  home: [number, number] | null;            // ตำแหน่งที่ปักไว้ (ไม่มี = ยังไม่ปัก)
  fallback: [number, number] | null;        // จุดกึ่งกลางเริ่มต้น เช่น ตัวจังหวัดที่เลือก
  universities: Meta['universities'];
  onPick: (lat: number, lng: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(home ?? fallback ?? THAILAND, home ? 11 : fallback ? 9 : 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(m);
    const seen = new Set<string>();
    for (const u of universities) {
      if (u.lat == null || u.lng == null) continue;
      const k = `${u.lat},${u.lng}`;
      if (seen.has(k)) continue;              // หลายวิทยาลัยใช้พิกัดตัวจังหวัดเดียวกัน
      seen.add(k);
      L.circleMarker([Number(u.lat), Number(u.lng)], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#57534e', fillOpacity: 0.9 }).bindTooltip(u.short_name || u.uni_name).addTo(m);
    }
    m.on('click', (e) => pick.current(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => { m.remove(); map.current = null; marker.current = null; };
    // สร้างแผนที่ครั้งเดียว ตำแหน่งที่เปลี่ยนภายหลังจัดการใน effect ด้านล่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!home) { marker.current?.remove(); marker.current = null; if (fallback) m.setView(fallback, 9); return; }
    if (!marker.current) {
      marker.current = L.marker(home, { icon: HOME_ICON, draggable: true, autoPan: true }).addTo(m);
      marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); pick.current(p.lat, p.lng); });
    } else marker.current.setLatLng(home);
    if (!m.getBounds().pad(-0.2).contains(home)) m.setView(home, Math.max(m.getZoom(), 11));
  }, [home?.[0], home?.[1], fallback?.[0], fallback?.[1]]);

  // isolate: ชั้นของแผนที่ (z-index สูงถึง 1000) ต้องไม่ทับแถบเมนูที่ลอยอยู่
  return <div className="relative isolate z-0 overflow-hidden rounded-xl ring-1 ring-black/10"><div ref={el} className="h-56 w-full sm:h-64" role="application" aria-label="แผนที่ปักหมุดบ้าน" /></div>;
}
