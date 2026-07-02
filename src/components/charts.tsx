"use client";
import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { C } from "@/lib/theme";
import { DIMS, composite } from "@/lib/wellbeing";
import type { Patient } from "@/lib/types";

interface TipPayload { dataKey: string; name: string; value: number; color?: string; stroke?: string }
export function ChartTip({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: number }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.ink, color: "#fff", maxWidth: 220 }}>
      <div className="font-bold mb-1">{label === 0 ? "Baseline" : `Session ${label}`}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color || p.stroke || "#fff" }}>{p.name}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function GlobalChart({ patients }: { patients: Patient[] }) {
  const chartable = patients.filter((p) => p.entries.length > 0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const maxS = useMemo(() => {
    const ss = chartable.flatMap((p) => p.entries.map((e) => e.session));
    return ss.length ? Math.max(...ss, 1) : 1;
  }, [patients]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const out: Record<string, number>[] = [];
    for (let s = 0; s <= maxS; s++) {
      const row: Record<string, number> = { session: s };
      chartable.forEach((p) => {
        const e = p.entries.find((en) => en.session === s);
        if (e) row[p.id] = composite(e.scores);
      });
      out.push(row);
    }
    return out;
  }, [patients, maxS]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!chartable.length)
    return <p className="text-sm" style={{ color: C.muted }}>No patient data yet. Charts appear once wellbeing check-ins are submitted.</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {chartable.map((p) => {
          const on = !hidden.has(p.id);
          const last = composite(p.entries[p.entries.length - 1].scores);
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
            {chartable.filter((p) => !hidden.has(p.id)).map((p) => (
              <Line key={p.id} dataKey={p.id} name={p.name} stroke={p.color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: p.color }} connectNulls type="monotone" isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs mt-1" style={{ color: C.muted }}>Wellbeing index 0–100 (mean of the six check-in scales). B = pre-therapy baseline. Click a patient to show or hide their line.</p>
    </div>
  );
}

export function PatientChart({ patient }: { patient: Patient }) {
  const [dims, setDims] = useState<Set<string>>(() => new Set());
  const toggleDim = (k: string) =>
    setDims((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const rows = patient.entries.map((e) => ({ session: e.session, index: composite(e.scores), ...e.scores }));
  if (rows.length < 1)
    return <p className="text-sm" style={{ color: C.muted }}>No wellbeing data yet — the chart appears once post-session check-ins begin.</p>;
  const maxS = rows[rows.length - 1].session;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: C.spruceSoft, color: C.spruce, border: `1px solid ${C.spruce}` }}>
          <span className="rounded-full" style={{ width: 9, height: 9, background: C.spruce }} />Wellbeing index
        </span>
        {DIMS.map((d) => {
          const on = dims.has(d.key);
          return (
            <button key={d.key} type="button" onClick={() => toggleDim(d.key)} aria-pressed={on} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: on ? C.surface : C.surfaceAlt, border: `1px solid ${on ? d.color : C.line}`, color: on ? C.ink : C.muted, opacity: on ? 1 : 0.6 }}>
              <span className="rounded-full" style={{ width: 9, height: 9, background: on ? d.color : "transparent", border: `2px solid ${d.color}` }} />{d.label}
            </button>
          );
        })}
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="session" type="number" domain={[Math.min(0, rows[0].session), Math.max(maxS, 1)]} ticks={Array.from({ length: maxS + 1 }, (_, i) => i)} tickFormatter={(s: number) => (s === 0 ? "B" : `S${s}`)} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <YAxis yAxisId="idx" domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <YAxis yAxisId="dim" domain={[0, 10]} hide />
            <Tooltip content={<ChartTip />} />
            {maxS >= 1 && <ReferenceLine yAxisId="idx" x={0.5} stroke={C.muted} strokeDasharray="4 4" label={{ value: "therapy begins", position: "insideTopLeft", fontSize: 10, fill: C.muted }} />}
            <Line yAxisId="idx" dataKey="index" name="Wellbeing index" stroke={C.spruce} strokeWidth={3} dot={{ r: 3, fill: C.spruce, strokeWidth: 0 }} type="monotone" isAnimationActive={false} />
            {DIMS.filter((d) => dims.has(d.key)).map((d) => (
              <Line key={d.key} yAxisId="dim" dataKey={d.key} name={`${d.label} (0–10)`} stroke={d.color} strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 2, fill: d.color, strokeWidth: 0 }} type="monotone" isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs mt-1" style={{ color: C.muted }}>Solid line: wellbeing index (0–100). Toggle individual scales (0–10, dashed) to inspect the drivers.</p>
    </div>
  );
}
