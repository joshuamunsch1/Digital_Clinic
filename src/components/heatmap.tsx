"use client";
// Shared heat-grid (Batch 13): item × occasion heatmap and the PSTB/SBKJ
// process profile. Plain CSS-grid divs — recharts has no heatmap primitive.
//
// Color is a SEQUENTIAL single-hue ramp (light → dark = clinically worse):
// lightness carries the encoding, so the grid stays readable under color-vision
// deficiency, and every cell shows its value as text — identity is never
// color-alone. Grey = no data.
import React from "react";
import { C } from "@/lib/theme";
import { trRaterRole, type Lang } from "@/lib/i18n";
import type { InstrumentDef } from "@/lib/instruments/types";
import type { ResponseRecord } from "@/lib/types";
import { itemValue01 } from "@/lib/instruments/item-display";
import { occasionOf } from "./charts";
import { useLang, useT } from "./LangContext";

/// Occasions beyond this render as "… n earlier" — keeps the DOM small on
/// long simulated courses (22 items × 45 sessions would be ~1000 cells).
const MAX_COLS = 24;

const RAMP_LO = [0xfb, 0xf3, 0xf1]; // near-white tint of C.danger
const RAMP_HI = [0x9c, 0x4a, 0x3c]; // C.danger
function heatColor(severity01: number): string {
  const k = Math.min(1, Math.max(0, severity01));
  return `#${RAMP_LO.map((lo, i) => Math.round(lo + (RAMP_HI[i] - lo) * k)
    .toString(16)
    .padStart(2, "0")).join("")}`;
}

export interface HeatRow {
  key: string;
  label: string;
  title?: string;
}
export interface HeatCol {
  key: string;
  label: string;
}
export interface HeatCell {
  /// Color intensity: 0 = favorable (light), 1 = unfavorable (dark), null = no
  /// data (grey) — direction handling happens in the callers.
  severity01: number | null;
  display: string;
  title?: string;
}

export function HeatGrid({ rows, cols, cellOf, footnote }: {
  rows: HeatRow[];
  cols: HeatCol[];
  cellOf: (rowKey: string, colKey: string) => HeatCell;
  footnote?: React.ReactNode;
}) {
  const t = useT();
  const capped = cols.length > MAX_COLS;
  const shown = capped ? cols.slice(-MAX_COLS) : cols;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.line}` }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(150px, 230px) repeat(${shown.length}, minmax(34px, 1fr))`,
            minWidth: 150 + shown.length * 34,
          }}>
          <div style={{ position: "sticky", left: 0, zIndex: 2, background: C.surface, borderBottom: `1px solid ${C.line}` }} />
          {shown.map((c) => (
            <div key={c.key} className="text-xs px-1 py-1 text-center font-semibold"
              style={{ color: C.muted, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap", overflow: "hidden" }}>
              {c.label}
            </div>
          ))}
          {rows.map((r) => (
            <React.Fragment key={r.key}>
              <div className="text-xs px-2 py-1" title={r.title ?? r.label}
                style={{
                  position: "sticky", left: 0, zIndex: 1, background: C.surface, color: C.ink,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderTop: `1px solid ${C.line}`,
                }}>
                {r.label}
              </div>
              {shown.map((c) => {
                const cell = cellOf(r.key, c.key);
                const dark = cell.severity01 !== null && cell.severity01 > 0.55;
                return (
                  <div key={c.key} className="text-xs text-center py-1" title={cell.title}
                    style={{
                      background: cell.severity01 === null ? C.surfaceAlt : heatColor(cell.severity01),
                      color: dark ? "#fff" : C.ink,
                      borderTop: `1px solid ${C.line}`, borderLeft: `1px solid ${C.surface}`,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                    {cell.display}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {capped && <p className="text-xs mt-1" style={{ color: C.muted }}>{t("earlierOccasionsNote", { n: cols.length - MAX_COLS })}</p>}
      {footnote && <p className="text-xs mt-1" style={{ color: C.muted }}>{footnote}</p>}
    </div>
  );
}

/// One column per response (occasion · rater when several raters exist);
/// duplicate occasion·rater pairs keep the later record, matching
/// sessionSeriesOf. Shared by both heatmap surfaces.
function responseColumns(instrument: InstrumentDef, responses: ResponseRecord[], lang: Lang) {
  const multiRole = new Set(responses.map((r) => r.respondentRole)).size > 1;
  const byCol = new Map<string, { col: HeatCol; order: number; at: number; r: ResponseRecord }>();
  for (const r of responses) {
    const occ = occasionOf(instrument, r);
    const key = `${occ.key}|${r.respondentRole}`;
    const at = Date.parse(r.occurredAt);
    const prev = byCol.get(key);
    if (prev && at < prev.at) continue;
    byCol.set(key, {
      col: { key, label: multiRole ? `${occ.label} · ${trRaterRole(r.respondentRole, lang)}` : occ.label },
      order: occ.order,
      at,
      r,
    });
  }
  const entries = [...byCol.values()].sort((a, b) => a.order - b.order || a.at - b.at);
  return { cols: entries.map((e) => e.col), byKey: new Map(entries.map((e) => [e.col.key, e.r])) };
}

/// Item × occasion heatmap: WHICH answers drive the scale scores. Colors use
/// the scoring engine's recode (reverse items flipped into the owning scale's
/// direction); the cell text stays the stored raw answer.
export function ItemHeatmap({ instrument, responses }: {
  instrument: InstrumentDef;
  responses: ResponseRecord[];
}) {
  const t = useT();
  const { lang } = useLang();
  const withAnswers = responses.filter((r) => Object.keys(r.rawAnswers).length > 0);
  const { cols, byKey } = responseColumns(instrument, withAnswers, lang);
  if (!instrument.items.length || !cols.length)
    return <p className="text-sm" style={{ color: C.muted }}>{t("noScoredResponses")}</p>;
  const itemById = new Map(instrument.items.map((it) => [it.id, it]));
  const rows: HeatRow[] = instrument.items.map((it) => ({
    key: it.id,
    label: `${it.label}${it.reverseScored ? ` ${t("reverseScored")}` : ""}`,
    title: it.text ?? it.label,
  }));
  const cellOf = (rowKey: string, colKey: string): HeatCell => {
    const r = byKey.get(colKey);
    const item = itemById.get(rowKey);
    const raw = r && item ? r.rawAnswers[rowKey] : undefined;
    const display = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
    const v01 = r && item ? itemValue01(instrument, item, raw) : null;
    return {
      severity01: v01 === null ? null : 1 - v01,
      display,
      title: item ? `${item.text ?? item.label}: ${display}` : undefined,
    };
  };
  return <HeatGrid rows={rows} cols={cols} cellOf={cellOf} footnote={t("itemHeatmapNote")} />;
}

/// Scale × occasion profile — surfaces the analytically dormant process
/// scales (all 8 PSTB / 3 SBKJ scales) at a glance. Cell color is the scale
/// value normalized to its range in improvement direction; scales without a
/// known range keep a grey cell (value text only) rather than an assumed one.
export function ProcessProfile({ instrument, responses }: {
  instrument: InstrumentDef;
  responses: ResponseRecord[];
}) {
  const t = useT();
  const { lang } = useLang();
  const scored = responses.filter((r) => Object.keys(r.scores).length > 0);
  const { cols, byKey } = responseColumns(instrument, scored, lang);
  if (!cols.length)
    return <p className="text-sm" style={{ color: C.muted }}>{t("noScoredResponses")}</p>;
  const scales = [...instrument.scales].sort((a, b) => a.sortOrder - b.sortOrder);
  const scaleByKey = new Map(scales.map((s) => [s.key, s]));
  const rows: HeatRow[] = scales.map((s) => ({ key: s.key, label: s.label }));
  const cellOf = (rowKey: string, colKey: string): HeatCell => {
    const r = byKey.get(colKey);
    const scale = scaleByKey.get(rowKey);
    const v = r && scale ? r.scores[scale.key] : undefined;
    if (typeof v !== "number" || !scale) return { severity01: null, display: "—" };
    const display = String(Math.round(v * 10) / 10);
    const range = scale.range;
    if (!range || range.max <= range.min) return { severity01: null, display, title: `${scale.label}: ${display}` };
    const frac = Math.min(1, Math.max(0, (v - range.min) / (range.max - range.min)));
    const favorable = (scale.higherIsBetter ?? true) ? frac : 1 - frac;
    return { severity01: 1 - favorable, display, title: `${scale.label}: ${display}` };
  };
  return <HeatGrid rows={rows} cols={cols} cellOf={cellOf} footnote={t("processHeatNote")} />;
}
