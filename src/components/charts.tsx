"use client";
import React, { useMemo, useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";
import { C, PALETTE } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { trCategory, trRaterRole } from "@/lib/i18n";
import type { ExpectedCoursePoint, SuddenShift } from "@/lib/analytics/types";
import type { ClinicCourse } from "@/lib/prediction/service";
import type { InstrumentDef, ScaleDef } from "@/lib/instruments/types";
import { classifyChange } from "@/lib/instruments/rci";
import type { GoalRecord, Patient, ResponseRecord } from "@/lib/types";
import {
  DIPS_INSTRUMENT_ID,
  DISORDER_CATEGORIES,
  SESSION_INSTRUMENT_ID,
  fmtScore,
  responsesFor,
} from "@/lib/types";
import { useLang, useT } from "./LangContext";
import { MiniTrend } from "./ui";

interface TipPayload { dataKey: string; name: string; value: number | [number, number]; color?: string; stroke?: string }
export function ChartTip({ active, payload, label }: { active?: boolean; payload?: TipPayload[]; label?: string | number }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.ink, color: "#fff", maxWidth: 240 }}>
      <div className="font-bold mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex justify-between gap-3">
          <span style={{ color: p.color || p.stroke || "#fff" }}>{p.name}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {Array.isArray(p.value) ? `${fmtScore(p.value[0])} – ${fmtScore(p.value[1])}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/// Prediction overlays for one scale of the chart (docs/outcome-prediction.md
/// Stage 1/3): the shaded expected-course band (p25–p75 + median), an optional
/// failure boundary, the ETR expected-value curve, and sudden gain/loss
/// diamonds. Only drawn while exactly `scaleKey` is visible (same gating as
/// the RCI markers) — overlays on a multi-scale chart would be unreadable.
export interface ChartPrediction {
  scaleKey: string;
  /// color distinguishes the band source visibly (clinic = spruce, NN = blue).
  band: { points: ExpectedCoursePoint[]; label: string; simulated: boolean; color?: string } | null;
  failureBoundary?: { session: number; value: number }[];
  etrPoints?: { session: number; expected: number }[];
  shifts: SuddenShift[];
  /// Alliance-rupture markers (open amber diamonds at the drop's toSession).
  /// Gated on `ruptureScaleKey` being the SINGLE visible scale — a condition
  /// deliberately separate from the band/ETR gating on `scaleKey`: the two
  /// scale keys differ (Therapiebeziehung vs. Therapiefortschritte), so the
  /// marker families never co-render.
  ruptures?: { toSession: number }[];
  ruptureScaleKey?: string;
}

const ROLE_DASHES = ["", "6 3", "2 3", "8 2", "4 4"];
const WAVE_ORDER = ["pre", "zm", "post", "postF"];

interface Occasion { key: string; label: string; order: number }

export function occasionOf(instrument: InstrumentDef, r: ResponseRecord): Occasion {
  if (instrument.cadenceType === "every_session" && r.sessionNumber !== null) {
    // "B"/"S{n}" is deliberately NOT localized: "S" reads as
    // Sitzung/Séance/Session in all three UI languages, and the "B" label is
    // load-bearing — rows[0].label === "B" gates the therapy-begins reference
    // line below. Wave codes (pre/zm/post/postF) are clinic jargon, kept as-is.
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
/// line style. Norm bands are shaded and RCI change markers (▲/▼ vs. the first
/// measurement) are drawn when exactly one scale is shown.
export function TrajectoryChart({ instrument, responses, height = 280, initialScales, prediction }: {
  instrument: InstrumentDef;
  responses: ResponseRecord[];
  height?: number;
  initialScales?: string[];
  prediction?: ChartPrediction;
}) {
  const t = useT();
  const { lang } = useLang();
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

  const visibleScalesEarly = scales.filter((s) => visible.has(s.key));
  // Prediction overlays require exactly the target scale to be visible. On the
  // session axis points map to S0/S1/…; on other cadences (wave/periodic, e.g.
  // BDI-FS) points are measurement indices attached to the patient's own
  // chronological occasions.
  const sessionAxis = instrument.cadenceType === "every_session";
  const overlay =
    prediction &&
    visibleScalesEarly.length === 1 &&
    visibleScalesEarly[0].key === prediction.scaleKey
      ? prediction
      : undefined;
  // Alliance-rupture markers gate on THEIR scale being the single visible one.
  const ruptureOverlay =
    prediction?.ruptures?.length &&
    prediction.ruptureScaleKey &&
    visibleScalesEarly.length === 1 &&
    visibleScalesEarly[0].key === prediction.ruptureScaleKey
      ? prediction
      : undefined;

  const rows = useMemo(() => {
    const byOccasion = new Map<string, { label: string; order: number; values: Record<string, number | [number, number] | null> }>();
    for (const r of scored) {
      const occ = occasionOf(instrument, r);
      let row = byOccasion.get(occ.key);
      if (!row) { row = { label: occ.label, order: occ.order, values: {} }; byOccasion.set(occ.key, row); }
      for (const [k, v] of Object.entries(r.scores)) row.values[`${k}|${r.respondentRole}`] = v;
    }
    if (overlay && sessionAxis) {
      // Overlay values live on session occasions; sessions beyond the patient's
      // last measurement extend the axis (a look-ahead window of 8 sessions).
      const lastMeasured = Math.max(0, ...scored.filter((r) => r.sessionNumber !== null).map((r) => r.sessionNumber!));
      const horizon = lastMeasured + 8;
      const sessionRow = (session: number) => {
        const key = `s${session}`;
        let row = byOccasion.get(key);
        if (!row) {
          row = { label: session === 0 ? "B" : `S${session}`, order: session, values: {} };
          byOccasion.set(key, row);
        }
        return row;
      };
      for (const p of overlay.band?.points ?? []) {
        if (p.session > horizon) continue;
        const row = sessionRow(p.session);
        row.values.__band = [p.p25, p.p75];
        row.values.__p50 = p.p50;
      }
      for (const b of overlay.failureBoundary ?? []) {
        if (b.session > horizon) continue;
        sessionRow(b.session).values.__boundary = b.value;
      }
      for (const e of overlay.etrPoints ?? []) {
        if (e.session > horizon) continue;
        sessionRow(e.session).values.__etr = Math.round(e.expected * 100) / 100;
      }
    } else if (overlay) {
      // Non-session cadence: overlay points are measurement indices — attach
      // point i to the patient's i-th chronological occasion. No look-ahead:
      // future occasions have no x position on a date/wave axis.
      const ordered = Array.from(byOccasion.values()).sort((a, b) => a.order - b.order);
      for (const p of overlay.band?.points ?? []) {
        const row = ordered[p.session];
        if (!row) continue;
        row.values.__band = [p.p25, p.p75];
        row.values.__p50 = p.p50;
      }
      for (const b of overlay.failureBoundary ?? []) {
        const row = ordered[b.session];
        if (row) row.values.__boundary = b.value;
      }
      // ETR is session-axis only and never supplied for these instruments.
    }
    return Array.from(byOccasion.values())
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ label: r.label, ...r.values }));
  }, [scored, instrument, overlay, sessionAxis]);

  if (!scored.length)
    return <p className="text-sm" style={{ color: C.muted }}>{t("noScoredResponses")}</p>;

  const colorOf = (key: string) => PALETTE[Math.max(0, scales.findIndex((s) => s.key === key)) % PALETTE.length];
  const visibleScales = visibleScalesEarly;
  const sharedRange = visibleScales.length && visibleScales.every(
    (s) => s.range && visibleScales[0].range && s.range.min === visibleScales[0].range.min && s.range.max === visibleScales[0].range.max,
  ) ? visibleScales[0].range : undefined;
  // Static norm bands give way to the empirical expected-course band when a
  // prediction overlay is active (both shaded areas would be illegible).
  const bands = visibleScales.length === 1 && !overlay?.band ? visibleScales[0].normBands : undefined;

  // Sudden gain/loss diamonds by occasion label (drawn at the shift's toSession).
  const shiftAt = new Map<string, SuddenShift>();
  if (overlay) for (const s of overlay.shifts) shiftAt.set(s.toSession === 0 ? "B" : `S${s.toSession}`, s);
  // Alliance-rupture occasions (open diamonds; disjoint from shiftAt — the two
  // marker families live on different scales).
  const ruptureAt = new Set<string>();
  if (ruptureOverlay) for (const r of ruptureOverlay.ruptures ?? []) ruptureAt.add(r.toSession === 0 ? "B" : `S${r.toSession}`);

  // RCI markers: only when a single scale with rci parameters is displayed.
  const rciScale: ScaleDef | undefined =
    visibleScales.length === 1 && visibleScales[0].rci ? visibleScales[0] : undefined;
  const baselines = new Map<string, number>(); // seriesKey -> first value
  if (rciScale) {
    for (const role of roles) {
      const seriesKey = `${rciScale.key}|${role}`;
      for (const row of rows) {
        const v = (row as Record<string, number | string>)[seriesKey];
        if (typeof v === "number") { baselines.set(seriesKey, v); break; }
      }
    }
  }
  const rciDot = (seriesKey: string, color: string) =>
    function RciDot(props: { cx?: number; cy?: number; payload?: Record<string, number | string>; index?: number }) {
      const { cx, cy, payload } = props;
      if (cx === undefined || cy === undefined || !payload) return <g key={`d${props.index}`} />;
      const v = payload[seriesKey];
      if (typeof v !== "number") return <g key={`d${props.index}`} />;
      // Alliance rupture: open amber diamond (the alliance scale's own marker).
      if (typeof payload.label === "string" && ruptureAt.has(payload.label)) {
        const d = 6.5;
        return (
          <polygon key={`d${props.index}`}
            points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
            fill="#fff" stroke={C.amber} strokeWidth={2} />
        );
      }
      // Sudden gain/loss diamond takes precedence over the RCI triangle.
      const shift = typeof payload.label === "string" ? shiftAt.get(payload.label) : undefined;
      if (shift) {
        const fill = shift.kind === "gain" ? C.spruce : C.danger;
        const d = 6.5;
        return (
          <polygon key={`d${props.index}`}
            points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
            fill={fill} stroke="#fff" strokeWidth={1.5} />
        );
      }
      const baseline = baselines.get(seriesKey);
      if (baseline === undefined || !rciScale)
        return <circle key={`d${props.index}`} cx={cx} cy={cy} r={3} fill={color} />;
      const cls = classifyChange(rciScale, baseline, v);
      if (cls === "unchanged") return <circle key={`d${props.index}`} cx={cx} cy={cy} r={3} fill={color} />;
      const good = cls === "improved";
      const fill = good ? C.spruce : C.danger;
      // triangle up (improved) / down (deteriorated)
      const points = good
        ? `${cx},${cy - 5.5} ${cx - 5},${cy + 3.5} ${cx + 5},${cy + 3.5}`
        : `${cx},${cy + 5.5} ${cx - 5},${cy - 3.5} ${cx + 5},${cy - 3.5}`;
      return <polygon key={`d${props.index}`} points={points} fill={fill} stroke="#fff" strokeWidth={1} />;
    };

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
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <YAxis
              domain={sharedRange ? [sharedRange.min, sharedRange.max] : ["auto", "auto"]}
              tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
            />
            <Tooltip content={<ChartTip />} />
            {bands?.map((b, i) => (
              <ReferenceArea key={b.label} y1={b.min} y2={b.max} fill={i % 2 ? C.spruce : C.amber} fillOpacity={0.05}
                label={{ value: b.label, position: "insideTopRight", fontSize: 10, fill: C.muted }} />
            ))}
            {/* Expected-course overlays render BEFORE the patient lines (paint order).
                Band color follows the source toggle (clinic = spruce, NN = blue). */}
            {overlay?.band && (
              <Area dataKey="__band" name={overlay.band.label} fill={overlay.band.color ?? C.spruce} fillOpacity={0.12}
                stroke="none" activeDot={false} connectNulls={false} isAnimationActive={false} legendType="none" />
            )}
            {overlay?.band && (
              <Line dataKey="__p50" name={t("bandMedian")} stroke={overlay.band.color ?? C.spruce} strokeWidth={1.2}
                strokeDasharray="5 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
            )}
            {overlay?.failureBoundary && overlay.failureBoundary.length > 0 && (
              <Line dataKey="__boundary" name={t("failureBoundary")} stroke={C.danger} strokeWidth={1.4}
                strokeDasharray="7 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
            )}
            {overlay?.etrPoints && overlay.etrPoints.length > 0 && (
              <Line dataKey="__etr" name={t("etrCurve")} stroke={C.blue} strokeWidth={1.4}
                strokeDasharray="2 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
            )}
            {instrument.cadenceType === "every_session" && rows.length > 1 && rows[0].label === "B" && (
              <ReferenceLine x={rows[1].label} stroke={C.muted} strokeDasharray="4 4"
                label={{ value: t("therapyBegins"), position: "insideTopLeft", fontSize: 10, fill: C.muted }} />
            )}
            {visibleScales.flatMap((s) =>
              roles.map((role, ri) => {
                const seriesKey = `${s.key}|${role}`;
                const color = colorOf(s.key);
                const withMarkers =
                  (rciScale && s.key === rciScale.key) ||
                  (overlay && s.key === overlay.scaleKey) ||
                  (ruptureOverlay && s.key === ruptureOverlay.ruptureScaleKey);
                return (
                  <Line
                    key={seriesKey}
                    dataKey={seriesKey}
                    name={multiRole ? `${s.label} (${trRaterRole(role, lang)})` : s.label}
                    stroke={color}
                    strokeWidth={ri === 0 ? 2.5 : 1.8}
                    strokeDasharray={ROLE_DASHES[ri % ROLE_DASHES.length]}
                    dot={withMarkers ? rciDot(seriesKey, color) : { r: 3, fill: color, strokeWidth: 0 }}
                    connectNulls type="monotone" isAnimationActive={false}
                  />
                );
              }),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {overlay?.band && (
        <p className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: C.muted }}>
          <span className="font-semibold" style={{ color: overlay.band.color ?? C.spruce }}>{overlay.band.label}</span>
          {overlay.shifts.length > 0 && <span>◆ = {t("suddenShiftLegend")}</span>}
          {overlay.band.simulated && (
            <span className="font-bold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
              {t("simulatedReference")}
            </span>
          )}
        </p>
      )}
      {ruptureOverlay && (
        <p className="text-xs mt-1" style={{ color: C.amber }}>◇ = {t("allianceLegend")}</p>
      )}
      {rciScale && <p className="text-xs mt-1" style={{ color: C.muted }}>{t("rciLegend")}</p>}
      {multiRole && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          {t("lineStylesNote")} {roles.map((r, i) => `${i === 0 ? "———" : i === 1 ? "– – –" : "· · ·"} = ${trRaterRole(r, lang)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

/// GAS goal-attainment trajectory: one line per therapy goal across its dated
/// therapist ratings on the fixed −1…+3 attainment axis. The dashed reference
/// line at 0 is the Ausgangslage baseline; the zone below it (negative change)
/// is tinted. Rating dates are unioned across goals; goals rated on different
/// days connect across the gaps.
export function GoalChart({ goals, height = 260 }: { goals: GoalRecord[]; height?: number }) {
  const t = useT();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setHidden((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const rated = goals.filter((g) => g.ratings.length > 0);
  const rows = useMemo(() => {
    const byDay = new Map<string, { label: string; order: number } & Record<string, string | number>>();
    for (const g of rated) {
      for (const r of g.ratings) {
        const day = r.at.slice(0, 10);
        let row = byDay.get(day);
        if (!row) {
          row = { label: fmtDate(r.at), order: new Date(day).getTime() };
          byDay.set(day, row);
        }
        row[g.id] = r.level; // ratings are date-sorted → same-day duplicates keep the latest
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.order - b.order);
  }, [rated]);

  if (!rated.length) return null;
  const colorOf = (g: GoalRecord) => PALETTE[goals.indexOf(g) % PALETTE.length];

  return (
    <div>
      {rated.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {rated.map((g) => {
            const on = !hidden.has(g.id);
            const color = colorOf(g);
            const label = g.title.length > 26 ? `${g.title.slice(0, 25)}…` : g.title;
            return (
              <button key={g.id} type="button" onClick={() => toggle(g.id)} aria-pressed={on} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: on ? C.surface : C.surfaceAlt, border: `1px solid ${on ? color : C.line}`, color: on ? C.ink : C.muted, opacity: on ? 1 : 0.6 }}>
                <span className="rounded-full" style={{ width: 9, height: 9, background: on ? color : "transparent", border: `2px solid ${color}` }} />{label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -24 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <YAxis domain={[-1, 3]} ticks={[-1, 0, 1, 2, 3]} allowDecimals={false}
              tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            <Tooltip content={<ChartTip />} />
            <ReferenceArea y1={-1} y2={0} fill={C.danger} fillOpacity={0.05} />
            <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 4"
              label={{ value: t("goalBaseline"), position: "insideTopLeft", fontSize: 10, fill: C.muted }} />
            {rated.filter((g) => !hidden.has(g.id)).map((g) => (
              <Line key={g.id} dataKey={g.id} name={g.title} stroke={colorOf(g)} strokeWidth={2.5}
                dot={{ r: 3, fill: colorOf(g), strokeWidth: 0 }}
                connectNulls type="monotone" isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/// The transposed per-patient score table (rows = scales, columns = occasions) —
/// same shape as the legacy per-patient xlsx export.
export function ScoreTable({ instrument, responses }: { instrument: InstrumentDef; responses: ResponseRecord[] }) {
  const t = useT();
  const { lang } = useLang();
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
            <th className="text-left pr-4 py-1" style={{ color: C.muted, fontWeight: 600 }}>{t("scaleCol")}</th>
            {cols.map(({ r, occ }) => (
              <th key={r.id} className="text-right px-2 py-1 whitespace-nowrap" style={{ color: C.muted, fontWeight: 600 }}>
                {occ.label}{multiRole ? ` · ${trRaterRole(r.respondentRole, lang)}` : ""}
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

/// Clinic-wide overview: one line per patient, with switchable instrument,
/// scale, and disorder-category filter (e.g. only eating-disorder patients'
/// EDE-Q8 trajectories). Occasions are aligned across patients per cadence:
/// sessions (B/S1…), waves (pre/zm/post/postF), or measurement index (M1…Mn)
/// for periodic instruments — the legacy report convention. When the selected
/// instrument+scale is a prediction target, the pooled clinic expected-course
/// band (p25–p75 + median) and failure boundary draw behind the patient lines.
export function GlobalChart({ patients, instruments, courses }: {
  patients: Patient[];
  instruments: InstrumentDef[];
  courses?: ClinicCourse[];
}) {
  const t = useT();
  const { lang } = useLang();

  const available = useMemo(
    () =>
      instruments.filter(
        (i) =>
          i.id !== DIPS_INSTRUMENT_ID &&
          i.scales.length > 0 &&
          patients.some((p) => responsesFor(p, i.id).some((r) => Object.keys(r.scores).length > 0)),
      ),
    [instruments, patients],
  );
  const [instId, setInstId] = useState(SESSION_INSTRUMENT_ID);
  const inst = available.find((i) => i.id === instId) ?? available[0];
  const [scaleKey, setScaleKey] = useState<string | null>(null);
  const scale = inst?.scales.find((s) => s.key === scaleKey) ?? inst?.scales[0];
  const [cat, setCat] = useState<string>("all");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Pooled clinic band for the current selection, if it is a prediction
  // target. Deliberately pooled across ALL reference cases regardless of the
  // category chips: stratification is a per-patient-baseline concept, and
  // category subsets of the reference cohort routinely fall below the
  // per-occasion minN — a per-category band would flicker in and out as
  // filters change. Session-axis bands need the session-label axis; the
  // index-axis target (BDI-FS) attaches to the M{n}/wave axis by position.
  const course = courses?.find((c) => c.instrumentId === inst?.id && c.scaleKey === scale?.key);
  const activeCourse =
    course && (course.axis === "index" || inst?.cadenceType === "every_session") ? course : undefined;

  const presentCategories = useMemo(
    () => DISORDER_CATEGORIES.filter((c) => patients.some((p) => p.disorderCategory === c)),
    [patients],
  );

  const chartable = useMemo(() => {
    if (!inst || !scale) return [];
    return patients
      .filter((p) => cat === "all" || p.disorderCategory === cat)
      .map((p) => {
        const series = responsesFor(p, inst.id)
          .filter((r) => typeof r.scores[scale.key] === "number")
          .map((r) => ({ r, occ: occasionOf(inst, r) }))
          .sort((a, b) => a.occ.order - b.occ.order)
          // periodic instruments: align patients by measurement index (M1..Mn)
          .map(({ r, occ }, idx) =>
            inst.cadenceType === "every_session" || inst.cadenceType === "wave"
              ? { value: r.scores[scale.key], label: occ.label, order: occ.order }
              : { value: r.scores[scale.key], label: `M${idx + 1}`, order: idx },
          );
        return { p, series };
      })
      .filter((x) => x.series.length > 0);
  }, [patients, inst, scale, cat]);

  const rows = useMemo(() => {
    const byOccasion = new Map<string, { label: string; order: number; values: Record<string, number | [number, number]> }>();
    for (const { p, series } of chartable) {
      for (const pt of series) {
        let row = byOccasion.get(pt.label);
        if (!row) { row = { label: pt.label, order: pt.order, values: {} }; byOccasion.set(pt.label, row); }
        row.values[p.id] = pt.value;
      }
    }
    if (activeCourse) {
      if (activeCourse.axis === "session") {
        // Cap the band at the last measured session — a 60-session reference
        // horizon would dwarf the patient lines. Missing intermediate rows are
        // created so the band stays continuous (patient lines connectNulls).
        const maxOrder = Math.max(...Array.from(byOccasion.values()).map((r) => r.order));
        const rowFor = (session: number) => {
          const label = session === 0 ? "B" : `S${session}`;
          let row = byOccasion.get(label);
          if (!row) { row = { label, order: session, values: {} }; byOccasion.set(label, row); }
          return row;
        };
        for (const p of activeCourse.points) {
          if (p.session > maxOrder) continue;
          const row = rowFor(p.session);
          row.values.__band = [p.p25, p.p75];
          row.values.__p50 = p.p50;
        }
        for (const b of activeCourse.failureBoundary) {
          if (b.session > maxOrder) continue;
          rowFor(b.session).values.__boundary = b.value;
        }
      } else {
        // Index axis (BDI-FS): attach reference point i to the i-th existing
        // occasion column — never synthesize labels (the axis may carry wave
        // codes), and never extend beyond what patients have measured.
        const ordered = Array.from(byOccasion.values()).sort((a, b) => a.order - b.order);
        for (const p of activeCourse.points) {
          const row = ordered[p.session];
          if (!row) continue;
          row.values.__band = [p.p25, p.p75];
          row.values.__p50 = p.p50;
        }
        for (const b of activeCourse.failureBoundary) {
          const row = ordered[b.session];
          if (row) row.values.__boundary = b.value;
        }
      }
    }
    return Array.from(byOccasion.values())
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ label: r.label, ...r.values }));
  }, [chartable, activeCourse]);

  if (!available.length)
    return <p className="text-sm" style={{ color: C.muted }}>{t("noScoredResponses")}</p>;
  if (!inst || !scale) return null;

  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap mb-3">
        <label className="block">
          <span className="text-xs font-semibold block mb-1" style={{ color: C.muted }}>{t("instrumentLabel")}</span>
          <select style={{ ...inputSelectStyle, minWidth: 180 }} value={inst.id} onChange={(e) => { setInstId(e.target.value); setScaleKey(null); setHidden(new Set()); }}>
            {available.map((i) => <option key={i.id} value={i.id}>{i.abbreviation} — {i.name.length > 46 ? i.name.slice(0, 46) + "…" : i.name}</option>)}
          </select>
        </label>
        {inst.scales.length > 1 && (
          <label className="block">
            <span className="text-xs font-semibold block mb-1" style={{ color: C.muted }}>{t("scaleCol")}</span>
            <select style={{ ...inputSelectStyle, minWidth: 160 }} value={scale.key} onChange={(e) => setScaleKey(e.target.value)}>
              {inst.scales.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        )}
        {presentCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            <button type="button" onClick={() => setCat("all")} aria-pressed={cat === "all"} className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: cat === "all" ? C.spruce : C.surfaceAlt, color: cat === "all" ? "#fff" : C.muted, border: `1px solid ${cat === "all" ? C.spruce : C.line}`, cursor: "pointer" }}>
              {t("allDisorders")}
            </button>
            {presentCategories.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} aria-pressed={cat === c} className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: cat === c ? C.spruce : C.surfaceAlt, color: cat === c ? "#fff" : C.muted, border: `1px solid ${cat === c ? C.spruce : C.line}`, cursor: "pointer" }}>
                {trCategory(c, lang)}
              </button>
            ))}
          </div>
        )}
      </div>
      {!chartable.length ? (
        <p className="text-sm" style={{ color: C.muted }}>{t("noScoredResponses")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {chartable.map(({ p, series }) => {
              const on = !hidden.has(p.id);
              const last = series[series.length - 1].value;
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: on ? C.surface : C.surfaceAlt, border: `1px solid ${on ? p.color : C.line}`, color: on ? C.ink : C.muted, opacity: on ? 1 : 0.55 }}>
                  <span className="rounded-full" style={{ width: 9, height: 9, background: on ? p.color : "transparent", border: `2px solid ${p.color}` }} />
                  {p.name}<span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{fmtScore(last)}</span>
                </button>
              );
            })}
          </div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
                <YAxis
                  domain={scale.range ? [scale.range.min, scale.range.max] : ["auto", "auto"]}
                  tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
                />
                <Tooltip content={<ChartTip />} />
                {/* Static norm bands are suppressed while the reference band is
                    drawn — two shaded areas are illegible (TrajectoryChart rule). */}
                {!activeCourse && scale.normBands?.map((b, i) => (
                  <ReferenceArea key={b.label} y1={b.min} y2={b.max} fill={i % 2 ? C.spruce : C.amber} fillOpacity={0.05}
                    label={{ value: b.label, position: "insideTopRight", fontSize: 10, fill: C.muted }} />
                ))}
                {inst.cadenceType === "every_session" && rows.length > 1 && rows[0].label === "B" && (
                  <ReferenceLine x={rows[1].label} stroke={C.muted} strokeDasharray="4 4"
                    label={{ value: t("therapyBegins"), position: "insideTopLeft", fontSize: 10, fill: C.muted }} />
                )}
                {/* Reference overlays paint BEFORE the patient lines. */}
                {activeCourse && (
                  <Area dataKey="__band" name={t("bandLabelClinic", { n: activeCourse.n })} fill={C.spruce} fillOpacity={0.12}
                    stroke="none" activeDot={false} connectNulls={false} isAnimationActive={false} legendType="none" />
                )}
                {activeCourse && (
                  <Line dataKey="__p50" name={t("bandMedian")} stroke={C.spruce} strokeWidth={1.2}
                    strokeDasharray="5 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
                )}
                {activeCourse && activeCourse.failureBoundary.length > 0 && (
                  <Line dataKey="__boundary" name={t("failureBoundary")} stroke={C.danger} strokeWidth={1.4}
                    strokeDasharray="7 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
                )}
                {chartable.filter(({ p }) => !hidden.has(p.id)).map(({ p }) => (
                  <Line key={p.id} dataKey={p.id} name={p.name} stroke={p.color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: p.color }} connectNulls type="monotone" isAnimationActive={false} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {activeCourse && (
            <p className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: C.muted }}>
              <span className="font-semibold" style={{ color: C.spruce }}>{t("bandLabelClinic", { n: activeCourse.n })}</span>
              <span style={{ color: C.danger }}>— — {t("failureBoundary")}</span>
              {activeCourse.includesSimulated && (
                <span className="font-bold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
                  {t("simulatedReference")}
                </span>
              )}
            </p>
          )}
          <p className="text-xs mt-1" style={{ color: C.muted }}>{scale.label}{scale.range ? ` · ${scale.range.min}–${scale.range.max}` : ""}</p>
        </>
      )}
    </div>
  );
}

const inputSelectStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8, fontSize: 13,
  border: `1px solid ${C.line}`, background: C.surface, color: C.ink,
};

/// Cross-instrument summary strip: one pill per instrument with scored data —
/// mini trend top-right, and the latest primary-scale value next to the fill
/// bar it is normalized into (bar color = clinical goodness of the level).
export function SummaryStrip({ patient, instruments }: { patient: Patient; instruments: InstrumentDef[] }) {
  const items = instruments
    .map((inst) => {
      const primary = inst.scales[0];
      if (!primary) return null;
      const values = responsesFor(patient, inst.id)
        .map((r) => r.scores[primary.key])
        .filter((v): v is number => typeof v === "number");
      if (!values.length) return null;
      const last = values[values.length - 1];
      const range = primary.range;
      const pct = range && range.max > range.min ? Math.round(((last - range.min) / (range.max - range.min)) * 100) : null;
      const higherIsBetter = primary.higherIsBetter ?? true;
      const goodness = pct === null ? null : higherIsBetter ? pct : 100 - pct; // 100 = best
      return { inst, primary, values, last, pct, goodness, higherIsBetter };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ inst, primary, values, last, pct, goodness, higherIsBetter }) => (
        <div key={inst.id} className="rounded-lg px-3 py-2" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, minWidth: 150 }}
          title={`${inst.name} — ${primary.label}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold" style={{ color: C.ink }}>{inst.abbreviation}</span>
            {/* Glyph + signed change since the previous measurement. */}
            <MiniTrend values={values} higherIsBetter={higherIsBetter} delta />
          </div>
          <div className="text-xs truncate" style={{ color: C.muted, maxWidth: 170 }}>{primary.label}</div>
          {/* The current value sits next to the bar it is normalized into. */}
          <div className="mt-1 flex items-center gap-2">
            {pct !== null && goodness !== null && (
              <div className="flex-1 rounded-full" style={{ height: 5, background: C.line }}>
                <div className="rounded-full" style={{ height: 5, width: `${pct}%`, background: goodness >= 50 ? C.spruce : goodness >= 25 ? C.amber : C.danger }} />
              </div>
            )}
            <span className="text-xs font-bold" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtScore(last)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
