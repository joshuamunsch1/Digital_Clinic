"use client";
// Director-only treatment-outcome evaluation (Batch 13): Jacobson–Truax
// pre/post scatter, category distribution, uncontrolled pre–post effect size,
// termination mix by year and dose–response over the archived labeled
// episodes. Fetched from /api/outcomes (server-side over the cached reference
// sample — archived dossiers never reach the client in full).
import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { C } from "@/lib/theme";
import { api, type OutcomesPayload } from "@/lib/api-client";
import { trTerminationReason } from "@/lib/i18n";
import type { JtCategory } from "@/lib/analytics/outcomes";
import { Card, SectionTitle, Stat } from "./ui";
import { useLang, useT } from "./LangContext";

const CATEGORY_COLOR: Record<JtCategory, string> = {
  recovered: C.spruce,
  improved: C.blue,
  unchanged: C.muted,
  deteriorated: C.danger,
};
const REASON_COLOR: Record<string, string> = {
  completed: C.spruce,
  dropout: C.danger,
  mutual: C.blue,
  transfer: C.amber,
  other: C.muted,
  unknown: C.line,
};

function catLabelKey(cat: JtCategory): "jtRecovered" | "jtImproved" | "jtUnchanged" | "jtDeteriorated" {
  return cat === "recovered" ? "jtRecovered" : cat === "improved" ? "jtImproved" : cat === "unchanged" ? "jtUnchanged" : "jtDeteriorated";
}

export function OutcomesView({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const [payload, setPayload] = useState<OutcomesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getOutcomes()
      .then((r) => {
        if (!cancelled) setPayload(r);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3"
        style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {t("backToOverview")}
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <SectionTitle sub={t("outcomesSub")}>{t("outcomesTitle")}</SectionTitle>
        {payload?.reference.includesSimulated && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full mb-4" style={{ background: C.amberSoft, color: C.amber }}>
            {t("simulatedReference")}
          </span>
        )}
      </div>

      {error && <Card className="p-5"><p className="text-sm" style={{ color: C.danger }}>✗ {error}</p></Card>}
      {!payload && !error && <Card className="p-5"><p className="text-sm" style={{ color: C.muted }}>{t("working")}</p></Card>}

      {payload && (() => {
        const { points, summary, target } = payload;
        const classified = points.filter((p) => p.category !== null);
        const unclassifiable = summary.n - summary.classifiable;
        const domain: [number, number] = target.range ? [target.range.min, target.range.max] : [0, 12];
        const rci = target.rciCutoff;
        // For a lower-is-better target, improvement lies BELOW the identity
        // diagonal; the JT band is the ± RCI corridor around it.
        return (
          <>
            <Card className="p-5 mb-4">
              <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("prePostTitle")}</h3>
              <p className="text-xs mb-3" style={{ color: C.muted }}>
                {t("prePostSub", { n: summary.n, excluded: payload.excluded })}
              </p>
              <div style={{ width: "100%", height: 340 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: -8 }}>
                    <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
                    <XAxis type="number" dataKey="pre" domain={domain} tickCount={7}
                      tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
                      label={{ value: t("prePostXAxis"), position: "insideBottom", offset: -8, fontSize: 11, fill: C.muted }} />
                    <YAxis type="number" dataKey="post" domain={domain} tickCount={7}
                      tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
                      label={{ value: t("prePostYAxis"), angle: -90, position: "insideLeft", offset: 18, fontSize: 11, fill: C.muted }} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload: tp }) => {
                        const d = active && tp?.length ? (tp[0].payload as (typeof points)[number]) : null;
                        if (!d) return null;
                        return (
                          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                            <p className="font-bold" style={{ color: C.ink }}>{d.code}</p>
                            <p style={{ color: C.muted }}>
                              {d.pre} → {d.post}
                              {d.category ? ` · ${t(catLabelKey(d.category))}` : ""}
                            </p>
                          </div>
                        );
                      }} />
                    {/* Identity (no change) + JT reliable-change corridor. */}
                    <ReferenceLine segment={[{ x: domain[0], y: domain[0] }, { x: domain[1], y: domain[1] }]}
                      stroke={C.muted} strokeWidth={1.2} ifOverflow="hidden" />
                    {rci !== null && (
                      <ReferenceLine segment={[{ x: domain[0], y: domain[0] + rci }, { x: domain[1] - rci, y: domain[1] }]}
                        stroke={C.muted} strokeDasharray="5 4" ifOverflow="hidden" />
                    )}
                    {rci !== null && (
                      <ReferenceLine segment={[{ x: domain[0] + rci, y: domain[0] }, { x: domain[1], y: domain[1] - rci }]}
                        stroke={C.muted} strokeDasharray="5 4" ifOverflow="hidden" />
                    )}
                    {/* Clinical cutoff c on both axes. */}
                    <ReferenceLine x={target.clinicalCutoff} stroke={C.amber} strokeDasharray="3 4" ifOverflow="hidden" />
                    <ReferenceLine y={target.clinicalCutoff} stroke={C.amber} strokeDasharray="3 4" ifOverflow="hidden" />
                    {(["recovered", "improved", "unchanged", "deteriorated"] as JtCategory[]).map((cat) => (
                      <Scatter key={cat} name={t(catLabelKey(cat))}
                        data={classified.filter((p) => p.category === cat)}
                        fill={CATEGORY_COLOR[cat]} fillOpacity={0.75} isAnimationActive={false} />
                    ))}
                    <Scatter data={points.filter((p) => p.category === null)} fill={C.line} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs mt-1 flex items-center gap-3 flex-wrap" style={{ color: C.muted }}>
                {(["recovered", "improved", "unchanged", "deteriorated"] as JtCategory[]).map((cat) => (
                  <span key={cat} className="inline-flex items-center gap-1">
                    <span className="rounded-full" style={{ width: 8, height: 8, background: CATEGORY_COLOR[cat] }} />
                    {t(catLabelKey(cat))}
                  </span>
                ))}
                <span>— {t("identityLegend")} · - - {t("rciBandLegend")} · <span style={{ color: C.amber }}>- -</span> {t("cutoffLegend", { c: target.clinicalCutoff })}</span>
              </p>
              <p className="text-xs mt-2" style={{ color: C.amber }}>⚠ {t("cutoffConfirmNote")}</p>
            </Card>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <Card className="p-5">
                <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("jtDistributionTitle")}</h3>
                <div className="flex flex-col gap-2">
                  {(["recovered", "improved", "unchanged", "deteriorated"] as JtCategory[]).map((cat) => {
                    const n = summary.categories[cat];
                    const pct = summary.classifiable ? Math.round((n / summary.classifiable) * 100) : 0;
                    return (
                      <div key={cat} className="flex items-center gap-2 text-xs">
                        <span style={{ color: C.ink, minWidth: 150 }} className="font-semibold">{t(catLabelKey(cat))}</span>
                        <span className="flex-1 rounded-full" style={{ height: 10, background: C.surfaceAlt }}>
                          <span className="block rounded-full" style={{ height: 10, width: `${pct}%`, background: CATEGORY_COLOR[cat] }} />
                        </span>
                        <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums", minWidth: 70 }} className="text-right">
                          {n} ({pct} %)
                        </span>
                      </div>
                    );
                  })}
                  {unclassifiable > 0 && (
                    <p className="text-xs mt-1" style={{ color: C.muted }}>{t("jtUnclassifiable", { n: unclassifiable })}</p>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("effectSizeTitle")}</h3>
                {summary.effectSize ? (
                  <>
                    <div className="flex gap-3 flex-wrap">
                      <Stat label={t("effectSizeLabel")} value={summary.effectSize.d.toFixed(2)} />
                      <Stat label={t("effectSizePre")} value={summary.effectSize.preMean.toFixed(1)} />
                      <Stat label={t("effectSizePost")} value={summary.effectSize.postMean.toFixed(1)} />
                    </div>
                    <p className="text-xs mt-2" style={{ color: C.muted }}>
                      {t("effectSizeCaveat", { n: summary.effectSize.n })}
                    </p>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: C.muted }}>{t("effectSizeUnavailable")}</p>
                )}
              </Card>
            </div>

            {summary.terminationByYear.length > 0 && (
              <Card className="p-5 mb-4">
                <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("terminationByYearTitle")}</h3>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={summary.terminationByYear.map(({ year, counts }) => ({ year: String(year), ...counts }))}
                      margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                      <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
                      <Tooltip cursor={{ fill: C.surfaceAlt }} />
                      {Object.keys(REASON_COLOR)
                        .filter((reason) => summary.terminationByYear.some(({ counts }) => counts[reason]))
                        .map((reason) => (
                          <Bar key={reason} dataKey={reason} name={trTerminationReason(reason, lang)} stackId="mix"
                            fill={REASON_COLOR[reason]} isAnimationActive={false} />
                        ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs mt-1 flex items-center gap-3 flex-wrap" style={{ color: C.muted }}>
                  {Object.keys(REASON_COLOR)
                    .filter((reason) => summary.terminationByYear.some(({ counts }) => counts[reason]))
                    .map((reason) => (
                      <span key={reason} className="inline-flex items-center gap-1">
                        <span className="rounded-full" style={{ width: 8, height: 8, background: REASON_COLOR[reason] }} />
                        {trTerminationReason(reason, lang)}
                      </span>
                    ))}
                </p>
              </Card>
            )}

            {summary.doseResponse.length > 0 && (
              <Card className="p-5 mb-4">
                <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("doseResponseTitle")}</h3>
                <p className="text-xs mb-3" style={{ color: C.muted }}>{t("doseResponseSub")}</p>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: -8 }}>
                      <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
                      <XAxis type="number" dataKey="sessions" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
                        label={{ value: t("doseResponseXAxis"), position: "insideBottom", offset: -8, fontSize: 11, fill: C.muted }} />
                      <YAxis type="number" dataKey="change" tick={{ fontSize: 11, fill: C.muted }} stroke={C.line}
                        label={{ value: t("doseResponseYAxis"), angle: -90, position: "insideLeft", offset: 18, fontSize: 11, fill: C.muted }} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <ReferenceLine y={0} stroke={C.muted} strokeWidth={1.2} />
                      <Scatter data={summary.doseResponse} fill={C.spruce} fillOpacity={0.6} isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            <p className="text-xs mb-6" style={{ color: C.muted }}>{t("outcomesRciNote")}</p>
          </>
        );
      })()}
    </div>
  );
}
