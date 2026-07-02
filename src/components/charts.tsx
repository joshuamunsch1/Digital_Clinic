"use client";
import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";
import { C, PALETTE } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import type { InstrumentDef } from "@/lib/instruments/types";
import type { Patient, ResponseRecord } from "@/lib/types";
import { checkinSeries, CHECKIN_PRIMARY_SCALE } from "@/lib/types";

interface TipPayload { dataKey: string; name: string; value: number; color?: string; stroke?: string }
export function ChartTip({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: string | number }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.ink, color: "#fff", maxWidth: 240 }}>
      <div className="font-bold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color || p.stroke || "#fff" }}>{p.name}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

const ROLE_DASHES = ["", "6 3", "2 3", "8 2", "4 4"];
const WAVE_ORDER = ["pre", "zm", "post", "postF"];

interface Occasion { key: string; label: string; order: number }

export function occasionOf(instrument: InstrumentDef, r: ResponseRecord): Occasion {
  if (instrument.cadenceType === "every_session" && r.sessionNumber !== null) {
    return {
      key: `s${r.sessionNumber}`,
      label: r.sessionNumber === 0 ? "B" : `S${r.sessionNumber}`,
      order: r.sessionNumber,
    };
  }
  const waves = instrument.cadenceConfig.waves ?? WAVE_ORDER;
  if (instrument.cadenceType === "wave" && r.wave) {
    const i = waves.indexOf(r.wave);
    return { key: r.wave, label: r.wave, order: i === -1 ? 1e12 + new Date(r.occurredAt).getTime() : i };
  }
  const t = new Date(r.occurredAt).getTime();
  return { key: r.occurredAt, label: fmtDate(r.occurredAt), order: t };
}

/// The generalized "Verlauf" chart: any instrument's scale scores across a
/// patient's response history. One toggle chip per scale; when several raters
/// have filled the same instrument (e.g. SDQ self + mother) each rater gets a
/// line style. Norm bands are shaded when exactly one scale is shown.
export function TrajectoryChart({ instrument, responses, height = 280, initialScales }: {
  instrument: InstrumentDef;
  responses: ResponseRecord[];
  height?: number;
  initialScales?: string[];
}) {
  const scales = instrument.scales;
  const scored = useMemo(
    () => responses.filter((r) => Object.keys(r.scores).length > 0),
    [responses],
  );
  const roles = useMemo(
    () => Array.from(new Set(scored.map((r) => r.respondentRole))),
    [scored],
  );
  const multiRole = roles.length > 1;

  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(initialScales ?? (scales.length ? [scales[0].key] : [])),
  );
  const toggle = (k: string) =>
    setVisible((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const rows = useMemo(() => {
    const byOccasion = new Map<string, { label: string; order: number; values: Record<string, number> }>();
    for (const r of scored) {
      const occ = occasionOf(instrument, r);
      let row = byOccasion.get(occ.key);
      if (!row) { row = { label: occ.label, order: occ.order, values: {} }; byOccasion.set(occ.key, row); }
      for (const [k, v] of Object.entries(r.scores)) row.values[`${k}|${r.respondentRole}`] = v;
    }
    return Array.from(byOccasion.values())
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ label: r.label, ...r.values }));
  }, [scored, instrument]);

  if (!scored.length)
    return <p className="text-sm" style={{ color: C.muted }}>No scored responses yet.</p>;

  const colorOf = (key: string) => PALETTE[Math.max(0, scales.findIndex((s) => s.key === key)) % PALETTE.length];
  const visibleScales = scales.filter((s) => visible.has(s.key));
  const sharedRange = visibleScales.length && visibleScales.every(
    (s) => s.range && visibleScales[0].range && s.range.min === visibleScales[0].range.min && s.range.max === visibleScales[0].range.max,
  ) ? visibleScales[0].range : undefined;
  const bands = visibleScales.length === 1 ? visibleScales[0].normBands : undefined;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {scales.map((s) => {
          const on = visible.has(s.key);
          const color = colorOf(s.key);
          return (
            <button key={s.key} type="button" onClick={() => toggle(s.key)} aria-pressed={on} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: on ? C.surface : C.surfaceAlt, border: `1px solid ${on ? color : C.line}`, color: on ? C.ink : C.muted, opacity: on ? 1 : 0.6 }}>
              <span className="rounded-full" style={{ width: 9, height: 9, background: on ? color : "transparent", border: `2px solid ${color}` }} />{s.label}
            </button>
          );
        })}
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <YAxis
              domain={sharedRange ? [sharedRange.min, sharedRange.max] : [0, "auto"]}
              tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
            />
            <Tooltip content={<ChartTip />} />
            {bands?.map((b, i) => (
              <ReferenceArea key={b.label} y1={b.min} y2={b.max} fill={i % 2 ? C.spruce : C.amber} fillOpacity={0.05}
                label={{ value: b.label, position: "insideTopRight", fontSize: 10, fill: C.muted }} />
            ))}
            {instrument.cadenceType === "every_session" && rows.length > 1 && rows[0].label === "B" && (
              <ReferenceLine x={rows[1].label} stroke={C.muted} strokeDasharray="4 4"
                label={{ value: "therapy begins", position: "insideTopLeft", fontSize: 10, fill: C.muted }} />
            )}
            {visibleScales.flatMap((s) =>
              roles.map((role, ri) => (
                <Line
                  key={`${s.key}|${role}`}
                  dataKey={`${s.key}|${role}`}
                  name={multiRole ? `${s.label} (${role})` : s.label}
                  stroke={colorOf(s.key)}
                  strokeWidth={ri === 0 ? 2.5 : 1.8}
                  strokeDasharray={ROLE_DASHES[ri % ROLE_DASHES.length]}
                  dot={{ r: 3, fill: colorOf(s.key), strokeWidth: 0 }}
                  connectNulls type="monotone" isAnimationActive={false}
                />
              )),
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {multiRole && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          Line styles distinguish raters: {roles.map((r, i) => `${i === 0 ? "solid" : i === 1 ? "dashed" : "dotted"} = ${r}`).join(" · ")}.
        </p>
      )}
    </div>
  );
}

/// The transposed per-patient score table (rows = scales, columns = occasions) —
/// same shape as the legacy per-patient xlsx export.
export function ScoreTable({ instrument, responses }: { instrument: InstrumentDef; responses: ResponseRecord[] }) {
  const scored = responses.filter((r) => Object.keys(r.scores).length > 0);
  if (!scored.length) return null;
  const cols = scored
    .map((r) => ({ r, occ: occasionOf(instrument, r) }))
    .sort((a, b) => a.occ.order - b.occ.order || a.r.respondentRole.localeCompare(b.r.respondentRole));
  const multiRole = new Set(scored.map((r) => r.respondentRole)).size > 1;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th className="text-left pr-4 py-1" style={{ color: C.muted, fontWeight: 600 }}>Scale</th>
            {cols.map(({ r, occ }) => (
              <th key={r.id} className="text-right px-2 py-1 whitespace-nowrap" style={{ color: C.muted, fontWeight: 600 }}>
                {occ.label}{multiRole ? ` · ${r.respondentRole}` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {instrument.scales.map((s) => (
            <tr key={s.key} style={{ borderTop: `1px solid ${C.line}` }}>
              <td className="pr-4 py-1 whitespace-nowrap" style={{ color: C.ink }}>{s.label}</td>
              {cols.map(({ r }) => {
                const v = r.scores[s.key];
                const band = v !== undefined ? s.normBands?.find((b) => v >= b.min && v <= b.max) : undefined;
                return (
                  <td key={r.id} className="text-right px-2 py-1" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                    {v !== undefined ? v : "—"}
                    {band && <span style={{ color: C.muted }}> ({band.label})</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/// Clinic-wide overview: one line per patient, using the session check-in's
/// primary scale (wellbeing index).
export function GlobalChart({ patients }: { patients: Patient[] }) {
  const chartable = patients
    .map((p) => ({ p, series: checkinSeries(p).filter((r) => r.scores[CHECKIN_PRIMARY_SCALE] !== undefined) }))
    .filter((x) => x.series.length > 0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const maxS = useMemo(
    () => Math.max(1, ...chartable.flatMap((x) => x.series.map((r) => r.sessionNumber ?? 0))),
    [chartable],
  );
  const rows = useMemo(() => {
    const out: Record<string, number>[] = [];
    for (let s = 0; s <= maxS; s++) {
      const row: Record<string, number> = { session: s };
      chartable.forEach(({ p, series }) => {
        const r = series.find((x) => x.sessionNumber === s);
        if (r) row[p.id] = Math.round(r.scores[CHECKIN_PRIMARY_SCALE]);
      });
      out.push(row);
    }
    return out;
  }, [chartable, maxS]);
  if (!chartable.length)
    return <p className="text-sm" style={{ color: C.muted }}>No patient data yet. Charts appear once session check-ins are submitted.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {chartable.map(({ p, series }) => {
          const on = !hidden.has(p.id);
          const last = Math.round(series[series.length - 1].scores[CHECKIN_PRIMARY_SCALE]);
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: on ? C.surface : C.surfaceAlt, border: `1px solid ${on ? p.color : C.line}`, color: on ? C.ink : C.muted, opacity: on ? 1 : 0.55 }}>
              <span className="rounded-full" style={{ width: 9, height: 9, background: on ? p.color : "transparent", border: `2px solid ${p.color}` }} />
              {p.name}<span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{last}</span>
            </button>
          );
        })}
      </div>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="session" type="number" domain={[0, maxS]} ticks={Array.from({ length: maxS + 1 }, (_, i) => i)} tickFormatter={(s: number) => (s === 0 ? "B" : `S${s}`)} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine x={0.5} stroke={C.muted} strokeDasharray="4 4" label={{ value: "therapy begins", position: "insideTopLeft", fontSize: 10, fill: C.muted }} />
            {chartable.filter(({ p }) => !hidden.has(p.id)).map(({ p }) => (
              <Line key={p.id} dataKey={p.id} name={p.name} stroke={p.color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: p.color }} connectNulls type="monotone" isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs mt-1" style={{ color: C.muted }}>Wellbeing index 0–100 (session check-in). B = pre-therapy baseline. Click a patient to show or hide their line.</p>
    </div>
  );
}
