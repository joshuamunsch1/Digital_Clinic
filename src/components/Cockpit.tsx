"use client";
// Caseload cockpit (Batch 13): Lambert-style traffic-light feedback table over
// the active in-therapy caseload — the "whom should I look at first" surface.
// Feedback on not-on-track patients is the best-evidenced outcome-improving
// intervention in routine care (progress-feedback meta-analyses); this table
// aggregates the EXISTING per-dossier signals, all computed client-side from
// data the dashboard already holds (plus the one summaries fetch).
import React from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import type { PredictionSummary } from "@/lib/prediction/service";
import type { InstrumentDef } from "@/lib/instruments/types";
import type { Patient, SessionUser, Therapist } from "@/lib/types";
import { activeAlerts, fmtScore } from "@/lib/types";
import { sessionSeriesOf } from "@/lib/analytics/types";
import { daysSince, latestPrimary, statusLight, type CockpitLight } from "@/lib/analytics/cockpit";
import { isOpenInvitation, isOverdue } from "@/lib/reminders";
import { CategoryChip, SimChip } from "./Dashboard";
import { EarlyChangeBadge } from "./PredictionPanel";
import { useT } from "./LangContext";

/// The PRIMARY prediction target (PREDICTION_TARGETS[0] in
/// src/lib/prediction/reference.ts — not importable here: that module chain is
/// server-only).
const PRIMARY_INSTRUMENT_ID = "phq4";
const PRIMARY_SCALE_KEY = "PHQ_total";

const LIGHT_COLOR: Record<CockpitLight, string> = {
  red: C.danger,
  amber: C.amber,
  green: C.spruce,
  grey: C.line,
};
const LIGHT_RANK: Record<CockpitLight, number> = { red: 0, amber: 1, green: 2, grey: 3 };

export function CaseloadCockpit({ patients, instruments, therapists, user, summaries, onOpenPatient }: {
  patients: Patient[];
  instruments: InstrumentDef[];
  therapists: Therapist[];
  user: SessionUser;
  summaries: Record<string, PredictionSummary>;
  onOpenPatient: (id: string) => void;
}) {
  const t = useT();
  const now = new Date();
  const isDirector = user.role === "director";
  const primaryScale = instruments
    .find((i) => i.id === PRIMARY_INSTRUMENT_ID)
    ?.scales.find((s) => s.key === PRIMARY_SCALE_KEY);
  const higherIsBetter = primaryScale?.higherIsBetter ?? false;

  const rows = patients
    .map((p) => {
      const alerts = activeAlerts(p, instruments);
      const summary = summaries[p.id];
      const light = statusLight(alerts.length, summary);
      const latest = latestPrimary(sessionSeriesOf(p.responses, PRIMARY_INSTRUMENT_ID, PRIMARY_SCALE_KEY));
      const scoredDates = p.responses
        .filter((r) => Object.keys(r.scores).length > 0)
        .map((r) => r.occurredAt)
        .sort();
      const lastMeasured = scoredDates.length ? scoredDates[scoredDates.length - 1] : null;
      const overdue = p.invitations.filter((i) => isOpenInvitation(i.status) && isOverdue(i, now)).length;
      const lightTitle =
        light === "red"
          ? t("clinicalAlert")
          : light === "amber"
            ? summary?.onTrack === "not_on_track"
              ? t("notOnTrack")
              : t("earlyDeterioration")
            : light === "green"
              ? t("onTrack")
              : t("insufficientReference");
      return { p, alerts, summary, light, lightTitle, latest, lastMeasured, days: daysSince(lastMeasured, now), overdue };
    })
    .sort(
      (a, b) =>
        LIGHT_RANK[a.light] - LIGHT_RANK[b.light] ||
        (b.days ?? -1) - (a.days ?? -1),
    );

  if (!rows.length) return null;

  const deltaColor = (delta: number) => {
    if (delta === 0) return C.muted;
    const favorable = higherIsBetter ? delta > 0 : delta < 0;
    return favorable ? C.spruce : C.danger;
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th className="text-center px-1 py-2" style={{ color: C.muted, fontWeight: 600 }} title={t("cockpitLegend")}>{t("colLight")}</th>
              <th className="text-left pr-3 py-2" style={{ color: C.muted, fontWeight: 600 }}>{t("colPatient")}</th>
              {isDirector && <th className="text-left px-2 py-2" style={{ color: C.muted, fontWeight: 600 }}>{t("colTherapist")}</th>}
              <th className="text-right px-2 py-2 whitespace-nowrap" style={{ color: C.muted, fontWeight: 600 }}>{t("colPrimary")}</th>
              <th className="text-left px-2 py-2" style={{ color: C.muted, fontWeight: 600 }}>{t("colSignals")}</th>
              <th className="text-left px-2 py-2" style={{ color: C.muted, fontWeight: 600 }}>{t("colDropout")}</th>
              <th className="text-right px-2 py-2 whitespace-nowrap" style={{ color: C.muted, fontWeight: 600 }}>{t("colLastMeasured")}</th>
              <th className="text-right px-2 py-2 whitespace-nowrap" style={{ color: C.muted, fontWeight: 600 }}>{t("colOverdueShort")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, summary, light, lightTitle, latest, lastMeasured, days, overdue }) => (
              <tr key={p.id} onClick={() => onOpenPatient(p.id)} style={{ borderTop: `1px solid ${C.line}`, cursor: "pointer" }}>
                <td className="text-center px-1 py-2">
                  <span className="inline-block rounded-full" title={lightTitle}
                    style={{
                      width: 12, height: 12, background: LIGHT_COLOR[light],
                      border: light === "grey" ? `1px solid ${C.muted}` : "none",
                    }} />
                </td>
                <td className="pr-3 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2 font-semibold" style={{ color: C.ink }}>
                    <span className="rounded-full" style={{ width: 9, height: 9, background: p.color }} />
                    {p.name}
                    <SimChip patient={p} />
                    <CategoryChip category={p.disorderCategory} />
                  </span>
                </td>
                {isDirector && (
                  <td className="px-2 py-2 whitespace-nowrap" style={{ color: C.muted }}>
                    {therapists.find((th) => th.id === p.therapistId)?.name ?? "—"}
                  </td>
                )}
                <td className="text-right px-2 py-2 whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {latest.value !== null ? (
                    <span style={{ color: C.ink }} className="font-bold">
                      {fmtScore(latest.value)}
                      {latest.delta !== null && (
                        <span className="font-semibold ml-1" style={{ color: deltaColor(latest.delta) }}>
                          {latest.delta > 0 ? "+" : latest.delta === 0 ? "±" : ""}{fmtScore(latest.delta)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span style={{ color: C.muted }}>—</span>
                  )}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {summary && <EarlyChangeBadge value={summary.earlyChange} compact />}
                    {summary?.onTrack === "not_on_track" && (
                      <span className="font-bold" style={{ color: C.amber }} title={t("notOnTrack")}>⚑</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2">
                  {summary?.dropoutRisk != null ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block rounded-full" style={{ width: 44, height: 6, background: C.line }}>
                        <span className="block rounded-full" style={{
                          width: `${Math.round(summary.dropoutRisk * 44)}px`, height: 6,
                          background: summary.dropoutRisk >= 0.35 ? C.danger : summary.dropoutRisk >= 0.2 ? C.amber : C.spruce,
                        }} />
                      </span>
                      <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{Math.round(summary.dropoutRisk * 100)} %</span>
                    </span>
                  ) : (
                    <span style={{ color: C.muted }}>—</span>
                  )}
                </td>
                <td className="text-right px-2 py-2 whitespace-nowrap" style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}
                  title={lastMeasured ? fmtDate(lastMeasured) : undefined}>
                  {days !== null ? t("daysAgoShort", { n: days }) : "—"}
                </td>
                <td className="text-right px-2 py-2 whitespace-nowrap">
                  {overdue > 0 ? (
                    <span className="font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>{overdue}</span>
                  ) : (
                    <span style={{ color: C.muted }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: C.muted }}>{t("cockpitLegend")}</p>
    </div>
  );
}
