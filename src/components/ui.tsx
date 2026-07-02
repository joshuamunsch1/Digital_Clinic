"use client";
import React from "react";
import { C } from "@/lib/theme";
import { tr, T, LANGS, type Lang } from "@/lib/i18n";
import type { Patient, PatientStatus } from "@/lib/types";
import { checkinSeries, CHECKIN_PRIMARY_SCALE } from "@/lib/types";

export function Card({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded-xl ${className}`} style={{ background: C.surface, border: `1px solid ${C.line}`, ...style }}>{children}</div>;
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="lc-display text-lg" style={{ color: C.ink }}>{children}</h2>
      {sub && <p className="text-sm mt-0.5" style={{ color: C.muted }}>{sub}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: PatientStatus }) {
  const map: Record<PatientStatus, { label: string; bg: string; fg: string }> = {
    assessment: { label: "Assessment due", bg: C.amberSoft, fg: C.amber },
    interview: { label: "Awaiting intake interview", bg: C.blueSoft, fg: C.blue },
    therapy: { label: "In therapy", bg: C.spruceSoft, fg: C.spruce },
  };
  const s = map[status];
  return <span className="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="px-4 py-3 flex-1 min-w-0">
      <div className="text-2xl font-bold" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: C.muted }}>{label}</div>
    </Card>
  );
}

export function TrendArrow({ patient }: { patient: Patient }) {
  const series = checkinSeries(patient).map((r) => r.scores[CHECKIN_PRIMARY_SCALE]).filter((v) => v !== undefined);
  if (series.length < 2) return <span style={{ color: C.muted }}>–</span>;
  const d = series[series.length - 1] - series[series.length - 2];
  if (d > 2) return <span style={{ color: C.spruce }}>▲</span>;
  if (d < -2) return <span style={{ color: C.danger }}>▼</span>;
  return <span style={{ color: C.muted }}>►</span>;
}

export function PrimaryButton({ children, onClick, disabled, small }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-lg font-semibold ${small ? "px-3 py-1.5 text-sm" : "px-5 py-2.5 text-sm"}`}
      style={{ background: disabled ? C.line : C.spruce, color: disabled ? C.muted : "#fff", cursor: disabled ? "not-allowed" : "pointer" }}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, small }: { children: React.ReactNode; onClick?: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg font-semibold ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      style={{ background: "transparent", color: C.spruce, border: `1px solid ${C.line}` }}>
      {children}
    </button>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14,
  border: `1px solid ${C.line}`, background: C.surface, color: C.ink,
};

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold block mb-1" style={{ color: C.ink }}>{label}</span>
      {children}
    </label>
  );
}

export function YesNo({ value, onChange, lang }: { value?: string; onChange: (v: string) => void; lang: Lang }) {
  const opts = [{ v: "yes", l: tr(T.yes, lang) }, { v: "no", l: tr(T.no, lang) }];
  return (
    <div className="flex gap-2">
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v} className="rounded-lg text-sm font-semibold px-5 py-2"
          style={{ background: value === o.v ? C.spruce : C.surfaceAlt, color: value === o.v ? "#fff" : C.muted, border: `1px solid ${value === o.v ? C.spruce : C.line}`, minWidth: 78 }}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function ScaleButtons({ count, value, onChange, w = 30, h = 30 }: { count: number; value?: number; onChange: (v: number) => void; w?: number; h?: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: count }, (_, n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n} className="rounded-md text-xs font-semibold"
          style={{ width: w, height: h, background: value === n ? C.spruce : C.surfaceAlt, color: value === n ? "#fff" : C.muted, border: `1px solid ${value === n ? C.spruce : C.line}` }}>
          {n}
        </button>
      ))}
    </div>
  );
}

export const Sev03 = ({ value, onChange }: { value?: number; onChange: (v: number) => void }) => <ScaleButtons count={4} value={value} onChange={onChange} />;
export const Scale08 = ({ value, onChange }: { value?: number; onChange: (v: number) => void }) => <ScaleButtons count={9} value={value} onChange={onChange} />;

export function LeafMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 4 C30 10 34 20 30 30 C24 34 14 32 10 24 C8 16 12 8 20 4 Z" fill={C.spruceSoft} stroke={C.spruce} strokeWidth="2" />
      <path d="M20 8 C20 16 20 24 20 33 M20 16 C16 18 14 21 13 24 M20 14 C24 16 26 19 27 22" fill="none" stroke={C.spruce} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export { LANGS };
