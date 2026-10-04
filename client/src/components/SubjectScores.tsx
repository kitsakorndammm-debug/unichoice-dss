import { useState } from 'react';
import type { Meta, Profile } from '../lib/types';
import { Input, cx } from './ui';

/**
 * กรอกคะแนนรายวิชา (ไม่บังคับ): ระบบจะคิดคะแนนรวมตามสูตรของแต่ละหลักสูตรแทนการใช้ "คะแนนสอบ (%)" ตัวเดียว
 * วิชาที่ไม่ได้กรอกจะใช้คะแนนสอบรวมแทน
 */
export function SubjectScores({ profile, meta, onChange }: { profile: Profile; meta: Meta; onChange: (patch: Partial<Profile>) => void }) {
  const scores = profile.subject_scores ?? {};
  const filled = Object.values(scores).filter((v) => v != null).length;
  const [open, setOpen] = useState(filled > 0);
  const groups = [...new Set(meta.subjects.map((s) => s.group))];

  const set = (key: string, raw: string) => {
    const next: Record<string, number> = { ...scores };
    if (raw === '') delete next[key];
    else next[key] = Math.min(100, Math.max(0, Number(raw)));
    onChange({ subject_scores: Object.keys(next).length ? next : null });
  };

  return (
    <div className="rounded-xl bg-brand-50/60 ring-1 ring-brand-100">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs sm:min-h-0">
        <span>
          <span className="font-semibold text-brand-900">กรอกคะแนนรายวิชา (ไม่บังคับ)</span>
          <span className="block text-ink-2">{filled > 0 ? `กรอกแล้ว ${filled} วิชา · ระบบคิดคะแนนรวมตามสูตรของแต่ละหลักสูตร` : 'ให้โอกาสสอบติดแม่นขึ้น เพราะแต่ละหลักสูตรใช้วิชาไม่เหมือนกัน'}</span>
        </span>
        <span aria-hidden className={cx('text-brand-700 transition', open && 'rotate-180')}>▾</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-brand-100 px-3 pb-3 pt-2.5">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-[11px] font-semibold text-ink-2">{g} <span className="font-normal text-muted">(คะแนนเต็ม 100)</span></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {meta.subjects.filter((s) => s.group === g).map((s) => (
                  <label key={s.key} className="block" title={s.hint}>
                    <span className="mb-0.5 block truncate text-[11px] text-ink">{s.label}</span>
                    <Input type="number" inputMode="decimal" min={0} max={100} step={0.5} placeholder="–" aria-label={`${s.label} (${s.hint})`}
                      value={scores[s.key] ?? ''} onChange={(e) => set(s.key, e.target.value)} className="sm:py-1.5" />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] leading-relaxed text-muted">
            กรอกเฉพาะวิชาที่สอบ วิชาที่เว้นว่างจะใช้ “คะแนนสอบ (%)” ด้านบนแทน · GPAX ใช้ค่า GPA สะสมที่กรอกไว้
            {filled > 0 && <button type="button" className="ml-2 underline hover:text-ink" onClick={() => onChange({ subject_scores: null })}>ล้างทั้งหมด</button>}
          </p>
        </div>
      )}
    </div>
  );
}
