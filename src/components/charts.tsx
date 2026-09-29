"use client";
import React, { useMemo, useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";
import { C, PALETTE } from "@/lib/theme";
import { fmtDate, fmtDateShort } from "@/lib/format";
import { trCategory, trRaterRole } from "@/lib/i18n";
import type { ExpectedCoursePoint, SuddenShift } from "@/lib/analytics/types";
import type { ClinicCourse } from "@/lib/prediction/service";
import type { InstrumentDef, ScaleDef } from "@/lib/instruments/types";
import { classifyChange } from "@/lib/instruments/rci";
import type { GoalRecord, Patient, ResponseRecord, SessionLogRecord } from "@/lib/types";
import { WEEK_MS, dateForSession, firstMeasurementAt, intervalStats, seriesAnchor, sessionDateMap, weeksSince } from "@/lib/analytics/time-axis";
import {
  DIPS_INSTRUMENT_ID,
  DISORDER_CATEGORIES,
  SESSION_INSTRUMENT_ID,
  fmtScore,
  responsesFor,
} from "@/lib/types";
import { useLang, useT } from "./LangContext";
import { MiniTrend } from "./ui";

interface TipPayload { dataKey: string; name: string; value: number | [number, number]; color?: string; stroke?: string; payload?: Record<string, unknown> }
export function ChartTip({ active, payload, label, labelOf }: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  /// Numeric (date / week) axes: derive the heading from the hovered row.
  labelOf?: (row: Record<string, unknown>, label: string | number | undefined) => string;
}) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const heading = labelOf && row ? labelOf(row, label) : label;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.ink, color: "#fff", maxWidth: 240 }}>
      <div className="font-bold mb-1">{heading}</div>
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
  /// Axis of the band/boundary/ETR points (`session` field): session number
  /// (default) or whole weeks since `anchorAt` (Batch 16, BDI-FS).
  axis?: "session" | "weeks";
  anchorAt?: string | null;
  /// Axis of the shift from/to fields: session number (default) or 0-based
  /// chronological measurement index (weeks-axis targets).
  shiftAxis?: "session" | "index";
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
    // Sitzung/Séance/Session in all three UI languages, and "B" marks the
    // baseline (the therapy-begins reference line is drawn after it). Wave
    // codes (pre/zm/post/postF) are clinic jargon, kept as-is.
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

/// Whether an instrument has a non-calendar native axis (sessions / waves) the
/// chart can switch to; date-cadenced instruments are always drawn by date.
export const hasNativeAxis = (instrument: InstrumentDef) =>
  instrument.cadenceType === "every_session" || instrument.cadenceType === "wave";

export type ChartXMode = "date" | "native";

/// One chart row: a measured occasion, or an overlay-only position (a future /
/// unmeasured session, a reference week). `t` is the calendar position (date
/// mode x), `s` the session number, `idx` the chronological measurement index.
interface ChartRow {
  label: string;
  order: number;
  t: number | null;
  s: number | null;
  idx: number | null;
  rids: string[];
  projected: boolean;
  values: Record<string, number | [number, number] | null>;
}

const sessionLabel = (k: number) => (k === 0 ? "B" : `S${k}`);

/// The generalized "Verlauf" chart: any instrument's scale scores across a
/// patient's response history. One toggle chip per scale; when several raters
/// have filled the same instrument (e.g. SDQ self + mother) each rater gets a
/// line style. Norm bands are shaded and RCI change markers (▲/▼ vs. the first
/// measurement) are drawn when exactly one scale is shown.
///
/// xMode (Batch 16): "date" puts occasions on a true calendar axis (spacing =
/// elapsed time; session labels move to the tooltip), "native" is the
/// categorical session/wave axis. Session-axis overlays are placed at each
/// session's date in date mode (measured → its date, gaps interpolated, the
/// look-ahead projected at the patient's recent rhythm); weeks-axis overlays
/// at anchor + w·7d.
export function TrajectoryChart({ instrument, responses, height = 280, initialScales, prediction, xMode = "date", sessionLogs, onSelectOccasion }: {
  instrument: InstrumentDef;
  responses: ResponseRecord[];
  height?: number;
  initialScales?: string[];
  prediction?: ChartPrediction;
  xMode?: ChartXMode;
  /// Held-session dates fill gaps when placing session-axis overlays by date.
  sessionLogs?: SessionLogRecord[];
  /// Chart click → the response ids of the clicked occasion.
  onSelectOccasion?: (responseIds: string[]) => void;
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
  const dateMode = xMode === "date" || !hasNativeAxis(instrument);

  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(initialScales ?? (scales.length ? [scales[0].key] : [])),
  );
  const toggle = (k: string) =>
    setVisible((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const visibleScalesEarly = scales.filter((s) => visible.has(s.key));
  // Prediction overlays require exactly the target scale to be visible.
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
    const byOccasion = new Map<string, ChartRow>();
    for (const r of scored) {
      const occ = occasionOf(instrument, r);
      const at = Date.parse(r.occurredAt);
      let row = byOccasion.get(occ.key);
      if (!row) {
        row = {
          label: occ.label,
          order: occ.order,
          t: at,
          s: instrument.cadenceType === "every_session" ? r.sessionNumber : null,
          idx: null,
          rids: [],
          projected: false,
          values: {},
        };
        byOccasion.set(occ.key, row);
      }
      row.t = Math.min(row.t ?? at, at);
      row.rids.push(r.id);
      for (const [k, v] of Object.entries(r.scores)) row.values[`${k}|${r.respondentRole}`] = v;
    }
    // Chronological measurement index (the weeks-axis shift coordinates).
    Array.from(byOccasion.values())
      .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
      .forEach((row, i) => { row.idx = i; });
    const measured = Array.from(byOccasion.values());
    const axis = overlay?.axis ?? "session";

    if (overlay && axis === "session") {
      // Overlay values live on session occasions; sessions beyond the patient's
      // last measurement extend the axis (a look-ahead window of 8 sessions).
      const lastMeasured = Math.max(0, ...scored.filter((r) => r.sessionNumber !== null).map((r) => r.sessionNumber!));
      const horizon = lastMeasured + 8;
      const known = dateMode ? sessionDateMap(scored, sessionLogs) : null;
      const sessionRow = (session: number): ChartRow | null => {
        const key = `s${session}`;
        let row = byOccasion.get(key);
        if (!row) {
          const pos = known ? dateForSession(known, session) : null;
          if (known && !pos) return null; // date mode without any dated session
          row = {
            label: sessionLabel(session),
            order: session,
            t: pos ? pos.t : null,
            s: session,
            idx: null,
            rids: [],
            projected: pos?.projected ?? false,
            values: {},
          };
          byOccasion.set(key, row);
        }
        return row;
      };
      for (const p of overlay.band?.points ?? []) {
        if (p.session > horizon) continue;
        const row = sessionRow(p.session);
        if (!row) continue;
        row.values.__band = [p.p25, p.p75];
        row.values.__p50 = p.p50;
      }
      for (const b of overlay.failureBoundary ?? []) {
        if (b.session > horizon) continue;
        const row = sessionRow(b.session);
        if (row) row.values.__boundary = b.value;
      }
      for (const e of overlay.etrPoints ?? []) {
        if (e.session > horizon) continue;
        const row = sessionRow(e.session);
        if (row) row.values.__etr = Math.round(e.expected * 100) / 100;
      }
    } else if (overlay && axis === "weeks" && overlay.anchorAt) {
      // Weeks since therapy start: week w sits at anchor + w·7d. Reference
      // weeks get their own rows (up to 8 weeks past the last measurement);
      // measured rows between two ADJACENT band weeks are interpolated so the
      // band stays continuous — a real minN gap in the reference stays a gap.
      const anchor = Date.parse(overlay.anchorAt);
      const lastT = Math.max(...measured.map((r) => r.t ?? anchor));
      const firstT = Math.min(...measured.map((r) => r.t ?? anchor));
      const horizonWeek = weeksSince(anchor, lastT) + 8;
      // Reference weeks before the patient's first measurement carry no
      // comparison and would only stretch the axis (e.g. a first BDI-FS in
      // week 16) — the band starts at the week of the first measurement.
      const firstWeek = weeksSince(anchor, firstT);
      const bandBy = new Map((overlay.band?.points ?? []).map((p) => [p.session, p]));
      const boundaryBy = new Map((overlay.failureBoundary ?? []).map((b) => [b.session, b.value]));
      const weeks = new Set([...bandBy.keys(), ...boundaryBy.keys()]);
      for (const w of weeks) {
        if (w > horizonWeek || w < firstWeek) continue;
        const row: ChartRow = {
          label: `W${w}`,
          order: w,
          t: anchor + w * WEEK_MS,
          s: null,
          idx: null,
          rids: [],
          projected: false,
          values: {},
        };
        const b = bandBy.get(w);
        if (b) { row.values.__band = [b.p25, b.p75]; row.values.__p50 = b.p50; }
        const fb = boundaryBy.get(w);
        if (fb !== undefined) row.values.__boundary = fb;
        byOccasion.set(`w${w}`, row);
      }
      const lerp = (a: number, b: number, f: number) => Math.round((a + (b - a) * f) * 100) / 100;
      for (const row of measured) {
        if (row.t === null || row.t < anchor) continue;
        const wf = (row.t - anchor) / WEEK_MS;
        const lo = Math.floor(wf);
        const f = wf - lo;
        const bl = bandBy.get(lo);
        const bh = bandBy.get(lo + 1);
        if (bl && (f === 0 || bh)) {
          const hi = bh ?? bl;
          row.values.__band = [lerp(bl.p25, hi.p25, f), lerp(bl.p75, hi.p75, f)];
          row.values.__p50 = lerp(bl.p50, hi.p50, f);
        }
        const fl = boundaryBy.get(lo);
        const fh = boundaryBy.get(lo + 1);
        if (fl !== undefined && (f === 0 || fh !== undefined)) row.values.__boundary = lerp(fl, fh ?? fl, f);
      }
    }
    const all = Array.from(byOccasion.values());
    return (dateMode
      ? all.filter((r) => r.t !== null).sort((a, b) => a.t! - b.t!)
      : all.sort((a, b) => a.order - b.order)
    ).map((r) => ({
      label: r.label,
      t: r.t,
      __s: r.s,
      __idx: r.idx,
      __rids: r.rids,
      __proj: r.projected,
      ...r.values,
    }));
  }, [scored, instrument, overlay, dateMode, sessionLogs]);

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

  // Sudden gain/loss diamonds at the shift's toSession — matched on the row's
  // session number, or on its chronological measurement index for weeks-axis
  // targets (whose shifts are computed on consecutive measurements).
  const shiftByIndex = overlay?.shiftAxis === "index";
  const shiftAt = new Map<number, SuddenShift>();
  if (overlay) for (const s of overlay.shifts) shiftAt.set(s.toSession, s);
  // Alliance-rupture occasions (open diamonds; disjoint from shiftAt — the two
  // marker families live on different scales). Always session-axis.
  const ruptureAt = new Set<number>();
  if (ruptureOverlay) for (const r of ruptureOverlay.ruptures ?? []) ruptureAt.add(r.toSession);

  // RCI markers: only when a single scale with rci parameters is displayed.
  const rciScale: ScaleDef | undefined =
    visibleScales.length === 1 && visibleScales[0].rci ? visibleScales[0] : undefined;
  const baselines = new Map<string, number>(); // seriesKey -> first value
  if (rciScale) {
    for (const role of roles) {
      const seriesKey = `${rciScale.key}|${role}`;
      for (const row of rows) {
        const v = (row as Record<string, unknown>)[seriesKey];
        if (typeof v === "number") { baselines.set(seriesKey, v); break; }
      }
    }
  }
  const rciDot = (seriesKey: string, color: string) =>
    function RciDot(props: { cx?: number; cy?: number; payload?: Record<string, unknown>; index?: number }) {
      const { cx, cy, payload } = props;
      if (cx === undefined || cy === undefined || !payload) return <g key={`d${props.index}`} />;
      const v = payload[seriesKey];
      if (typeof v !== "number") return <g key={`d${props.index}`} />;
      const sNum = typeof payload.__s === "number" ? payload.__s : null;
      const iNum = typeof payload.__idx === "number" ? payload.__idx : null;
      // Alliance rupture: open amber diamond (the alliance scale's own marker).
      if (sNum !== null && ruptureAt.has(sNum)) {
        const d = 6.5;
        return (
          <polygon key={`d${props.index}`}
            points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
            fill="#fff" stroke={C.amber} strokeWidth={2} />
        );
      }
      // Sudden gain/loss diamond takes precedence over the RCI triangle.
      const shiftKey = shiftByIndex ? iNum : sNum;
      const shift = shiftKey !== null ? shiftAt.get(shiftKey) : undefined;
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

  // "Therapie beginnt" after the baseline (B) session.
  const baselineIdx = rows.findIndex((r) => r.__s === 0 && r.__rids.length > 0);
  const therapyStartRow = baselineIdx >= 0 ? rows.slice(baselineIdx + 1).find((r) => r.__rids.length > 0) : undefined;
  const tipLabel = (row: Record<string, unknown>) => {
    const tt = typeof row.t === "number" ? row.t : null;
    const lbl = typeof row.label === "string" ? row.label : "";
    const date = tt !== null ? fmtDate(new Date(tt)) : "";
    const head = lbl && lbl !== date ? (date ? `${lbl} · ${date}` : lbl) : date;
    return row.__proj ? `${head} (${t("projectedSession")})` : head;
  };
  // Measurement rhythm caption (date mode): spacing between measured occasions.
  const rhythm = dateMode ? intervalStats(rows.filter((r) => r.__rids.length > 0 && r.t !== null).map((r) => r.t as number)) : null;
  const clickable = !!onSelectOccasion;

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
      <div style={{ width: "100%", height, cursor: clickable ? "pointer" : undefined }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
            onClick={clickable ? (st: { activePayload?: { payload?: { __rids?: string[] } }[] } | null) => {
              const rids = st?.activePayload?.[0]?.payload?.__rids;
              if (rids && rids.length) onSelectOccasion!(rids);
            } : undefined}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            {dateMode ? (
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} padding={{ left: 14, right: 14 }}
                tickFormatter={(v: number) => fmtDateShort(v)} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            ) : (
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
            )}
            <YAxis
              domain={sharedRange ? [sharedRange.min, sharedRange.max] : ["auto", "auto"]}
              tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
            />
            <Tooltip content={<ChartTip labelOf={tipLabel} />} />
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
            {therapyStartRow && (
              <ReferenceLine x={dateMode ? (therapyStartRow.t as number) : therapyStartRow.label} stroke={C.muted} strokeDasharray="4 4"
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
      {(rhythm || clickable) && (
        <p className="text-xs mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap" style={{ color: C.muted }}>
          {rhythm && <span>{t("rhythmCaption", { median: rhythm.medianDays, min: rhythm.minDays, max: rhythm.maxDays })}</span>}
          {clickable && <span>{t("chartClickHint")}</span>}
        </p>
      )}
      {overlay?.band && (
        <p className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: C.muted }}>
          <span className="font-semibold" style={{ color: overlay.band.color ?? C.spruce }}>{overlay.band.label}</span>
          {/* The reference may not reach the patient's measured weeks (thin
              strata late in therapy) — say so instead of a silent empty band. */}
          {!rows.some((r) => Array.isArray((r as Record<string, unknown>).__band)) && (
            <span style={{ color: C.amber }}>{t("bandNoOverlap")}</span>
          )}
          {overlay.axis === "weeks" && <span>{t("bandWeeksNote")}</span>}
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
/// sessions (B/S1…, the dose axis — switchable to weeks), waves
/// (pre/zm/post/postF), or — for date-cadenced instruments like the BDI-FS —
/// whole WEEKS since therapy start (Batch 16; the former measurement-index
/// alignment M1…Mn put a weekly patient's week 1 next to another patient's
/// mid-therapy measurement). When the selected instrument+scale is a
/// prediction target on the current axis, the pooled clinic expected-course
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
  // Every-session instruments: sessions (dose, default) or weeks since start.
  const [sessionXMode, setSessionXMode] = useState<"session" | "weeks">("session");
  const xMode: "session" | "weeks" | "wave" =
    inst?.cadenceType === "wave" ? "wave" : inst?.cadenceType === "every_session" ? sessionXMode : "weeks";
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setHidden((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Pooled clinic band for the current selection, if it is a prediction
  // target. Deliberately pooled across ALL reference cases regardless of the
  // category chips: stratification is a per-patient-baseline concept, and
  // category subsets of the reference cohort routinely fall below the
  // per-occasion minN — a per-category band would flicker in and out as
  // filters change. A band draws only on its own axis: session courses in the
  // session view, weeks courses (BDI-FS) in the weeks view.
  const course = courses?.find((c) => c.instrumentId === inst?.id && c.scaleKey === scale?.key);
  const activeCourse = course && course.axis === xMode ? course : undefined;
  const hiddenSessionCourse = course && course.axis === "session" && xMode === "weeks";

  const presentCategories = useMemo(
    () => DISORDER_CATEGORIES.filter((c) => patients.some((p) => p.disorderCategory === c)),
    [patients],
  );

  const chartable = useMemo(() => {
    if (!inst || !scale) return [];
    return patients
      .filter((p) => cat === "all" || p.disorderCategory === cat)
      .map((p) => {
        const measured = responsesFor(p, inst.id).filter((r) => typeof r.scores[scale.key] === "number");
        // Weeks axis: each patient's own day 0 (therapy start, else first
        // measurement) — same rule as the analytics (time-axis.ts).
        const anchor =
          xMode === "weeks" ? seriesAnchor(p.treatmentStartAt, firstMeasurementAt(measured, inst.id, scale.key)) : null;
        const series = measured
          .map((r) => {
            const at = Date.parse(r.occurredAt);
            if (xMode === "weeks") {
              const w = weeksSince(anchor ?? at, at);
              return { value: r.scores[scale.key], label: `W${w}`, order: w, at };
            }
            const occ = occasionOf(inst, r);
            return { value: r.scores[scale.key], label: occ.label, order: occ.order, at };
          })
          // Same-occasion duplicates (two measurements in one week): the later wins.
          .sort((a, b) => a.order - b.order || a.at - b.at);
        return { p, series };
      })
      .filter((x) => x.series.length > 0);
  }, [patients, inst, scale, cat, xMode]);

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
      // Cap the band at the last measured occasion — a 60-session reference
      // horizon would dwarf the patient lines. Missing intermediate rows are
      // created so the band stays continuous (patient lines connectNulls).
      const maxOrder = Math.max(...Array.from(byOccasion.values()).map((r) => r.order));
      const rowFor = (session: number) => {
        const label = activeCourse.axis === "weeks" ? `W${session}` : session === 0 ? "B" : `S${session}`;
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
    }
    return Array.from(byOccasion.values())
      .sort((a, b) => a.order - b.order)
      .map((r) => ({ label: r.label, x: r.order, ...r.values }));
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
        {inst.cadenceType === "every_session" && (
          <div className="flex flex-wrap gap-1.5 pb-0.5" role="group" aria-label={t("xAxisLabel")}>
            {(["session", "weeks"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setSessionXMode(m)} aria-pressed={sessionXMode === m}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: sessionXMode === m ? C.blue : C.surfaceAlt, color: sessionXMode === m ? "#fff" : C.muted, border: `1px solid ${sessionXMode === m ? C.blue : C.line}`, cursor: "pointer" }}>
                {m === "session" ? t("axisSessions") : t("axisWeeks")}
              </button>
            ))}
          </div>
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
                {xMode === "weeks" ? (
                  <XAxis dataKey="x" type="number" domain={[0, "dataMax"]} allowDecimals={false}
                    tickFormatter={(w: number) => `${t("weekShort")}${w}`} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
                ) : (
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
                )}
                <YAxis
                  domain={scale.range ? [scale.range.min, scale.range.max] : ["auto", "auto"]}
                  tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
                />
                <Tooltip content={<ChartTip labelOf={xMode === "weeks" ? (row) => t("weekN", { n: Number(row.x) }) : undefined} />} />
                {/* Static norm bands are suppressed while the reference band is
                    drawn — two shaded areas are illegible (TrajectoryChart rule). */}
                {!activeCourse && scale.normBands?.map((b, i) => (
                  <ReferenceArea key={b.label} y1={b.min} y2={b.max} fill={i % 2 ? C.spruce : C.amber} fillOpacity={0.05}
                    label={{ value: b.label, position: "insideTopRight", fontSize: 10, fill: C.muted }} />
                ))}
                {xMode === "session" && rows.length > 1 && rows[0].label === "B" && (
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
          {hiddenSessionCourse && <p className="text-xs mt-1" style={{ color: C.muted }}>{t("bandSessionViewOnly")}</p>}
          <p className="text-xs mt-1" style={{ color: C.muted }}>
            {scale.label}{scale.range ? ` · ${scale.range.min}–${scale.range.max}` : ""}
            {xMode === "weeks" ? ` · ${t("weeksAxisCaption")}` : ""}
          </p>
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
export function SummaryStrip({ patient, instruments, onSelect }: {
  patient: Patient;
  instruments: InstrumentDef[];
  /// Dossier: a pill click opens that instrument's latest answers.
  onSelect?: (instrumentId: string) => void;
}) {
  const t = useT();
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
      {items.map(({ inst, primary, values, last, pct, goodness, higherIsBetter }) => {
        const Tag = onSelect ? "button" : "div";
        return (
        <Tag key={inst.id} type={onSelect ? "button" : undefined} onClick={onSelect ? () => onSelect(inst.id) : undefined}
          className="rounded-lg px-3 py-2 text-left" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, minWidth: 150, cursor: onSelect ? "pointer" : undefined }}
          title={onSelect ? `${inst.name} — ${primary.label} · ${t("openLatestAnswers")}` : `${inst.name} — ${primary.label}`}>
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
        </Tag>
        );
      })}
    </div>
  );
}
