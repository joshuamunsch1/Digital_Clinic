"use client";
// Therapist-facing decision support (docs/outcome-prediction.md): the
// expected-course source toggle, early-change / on-track status, dropout-risk
// gauge and nearest-neighbor summary. Deliberately honest about its evidence:
// every surface shows the reference n, the "simulated data" badge whenever the
// reference sample contains synthetic cases, the ETR curve is labeled an
// approximation, and unavailable models say so instead of guessing.
// Never rendered for patient sessions (PatientDetail is staff-only, and the
// API 403s patients besides).
import React from "react";
import { C } from "@/lib/theme";
import { trTerminationReason } from "@/lib/i18n";
import type { PredictionPayload } from "@/lib/prediction/service";
import type { EarlyChange } from "@/lib/analytics/types";
import { Card } from "./ui";
import { useLang, useT } from "./LangContext";

export type BandSource = "clinic" | "nn" | "etr";

/// Display abbreviations for the prediction-target instruments
/// (PREDICTION_TARGETS in src/lib/prediction/reference.ts).
const SERIES_LABELS: Record<string, string> = { phq4: "PHQ-4", pstb_adult: "PSTB", bdi_fs: "BDI-FS" };

/// Germanized display names for the dropout model's top factors.
const FEATURE_KEYS: Record<string, string> = {
  age: "featAge",
  baseline_severity: "featBaseline",
  treatment_expectation: "featExpectation",
  problem_duration: "featDuration",
  prior_psychotherapy: "featPriorTx",
  psychotropic_medication: "featMedication",
  sex_male: "featSexMale",
  early_response: "featEarlyResponse",
  early_deterioration: "featEarlyDeterioration",
};

export function EarlyChangeBadge({ value, compact }: { value: EarlyChange | null; compact?: boolean }) {
  const t = useT();
  if (!value) return null;
  const cfg =
    value === "early_response"
      ? { icon: "▲", bg: C.spruceSoft, fg: C.spruce, label: t("earlyResponse") }
      : value === "early_deterioration"
        ? { icon: "▼", bg: C.amberSoft, fg: C.amber, label: t("earlyDeterioration") }
        : { icon: "○", bg: C.surfaceAlt, fg: C.muted, label: t("earlyIndeterminate") };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" title={cfg.label}
      style={{ background: cfg.bg, color: cfg.fg }}>
      {cfg.icon}{compact ? "" : ` ${cfg.label}`}
    </span>
  );
}

export function PredictionPanel({ prediction, loading, source, onSourceChange }: {
  prediction: PredictionPayload | null;
  loading: boolean;
  source: BandSource;
  onSourceChange: (s: BandSource) => void;
}) {
  const t = useT();
  const { lang } = useLang();

  if (loading)
    return (
      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("predictionTitle")}</h3>
        <p className="text-sm mt-2" style={{ color: C.muted }}>{t("loading")}</p>
      </Card>
    );
  if (!prediction) return null;

  const primary = prediction.series[0];
  const nn = primary?.nn;
  const dropout = prediction.dropoutRisk;
  const simulated = prediction.reference.includesSimulated;

  // A source stays selectable if ANY monitored series supports it — the charts
  // fall back per series when a particular one lacks the data.
  const sources: { key: BandSource; label: string; disabled: boolean; reason?: string }[] = [
    { key: "clinic", label: t("sourceClinic"), disabled: false },
    { key: "nn", label: t("sourceNn"), disabled: !prediction.series.some((s) => s.nn.available), reason: t("nnUnavailable") },
    { key: "etr", label: t("sourceEtr"), disabled: !prediction.series.some((s) => s.etr.available), reason: t("etrUnavailable") },
  ];

  const featureLabel = (feature: string): string => {
    const key = FEATURE_KEYS[feature];
    if (key) return t(key as Parameters<typeof t>[0]);
    if (feature.startsWith("employment_")) return `${t("employmentLabel")}: ${feature.slice("employment_".length)}`;
    if (feature.startsWith("category_")) return `${t("disorderCategoryLabel")}: ${feature.slice("category_".length)}`;
    return feature;
  };

  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("predictionTitle")}</h3>
        {simulated && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
            {t("simulatedReference")}
          </span>
        )}
        <span className="ml-auto text-xs" style={{ color: C.muted }}>
          {t("referenceN", { n: prediction.reference.n })}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: C.muted }}>{t("predictionSub")}</p>

      {/* Expected-course source toggle — feeds the trajectory charts below. */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs font-semibold" style={{ color: C.ink }}>{t("expectedCourseLabel")}</span>
        {sources.map((s) => (
          <button key={s.key} type="button" disabled={s.disabled} aria-pressed={source === s.key}
            onClick={() => onSourceChange(s.key)}
            title={s.disabled ? s.reason : undefined}
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: source === s.key ? C.spruce : C.surfaceAlt,
              color: source === s.key ? "#fff" : s.disabled ? C.line : C.muted,
              border: `1px solid ${source === s.key ? C.spruce : C.line}`,
              cursor: s.disabled ? "not-allowed" : "pointer",
            }}>
            {s.label}
          </button>
        ))}
        {source === "etr" && <span className="text-xs" style={{ color: C.amber }}>{t("etrCaveat")}</span>}
      </div>

      {/* Status line: early change + on-track per monitored scale. */}
      <div className="flex flex-col gap-1 mb-3">
        {prediction.series.map((s) => (
          <div key={`${s.instrumentId}|${s.scaleKey}`} className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-semibold" style={{ color: C.ink, minWidth: 110 }}>{SERIES_LABELS[s.instrumentId] ?? s.instrumentId} · {s.scaleKey}</span>
            <EarlyChangeBadge value={s.earlyChange} />
            {s.onTrack.status === "not_on_track" ? (
              <span className="font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
                {t("notOnTrack")}
              </span>
            ) : s.onTrack.status === "on_track" ? (
              <span className="font-semibold px-2 py-0.5 rounded-full" style={{ background: C.spruceSoft, color: C.spruce }}>
                {t("onTrack")}
              </span>
            ) : (
              <span style={{ color: C.muted }}>{t("insufficientReference")}</span>
            )}
            {s.suddenShifts.map((sh) => (
              <span key={`${sh.fromSession}-${sh.toSession}`} style={{ color: sh.kind === "gain" ? C.spruce : C.danger }}>
                ◆ {sh.kind === "gain" ? t("suddenGain") : t("suddenLoss")} S{sh.fromSession}→S{sh.toSession}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Dropout-risk gauge with honest framing. */}
        <div className="rounded-lg p-3" style={{ background: C.surfaceAlt }}>
          <p className="text-xs font-bold mb-1" style={{ color: C.ink }}>{t("dropoutTitle")}</p>
          {dropout.available && dropout.probability !== undefined ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full" style={{ height: 8, background: C.line }}>
                  <div className="rounded-full" style={{
                    height: 8,
                    width: `${Math.round(dropout.probability * 100)}%`,
                    background: dropout.probability >= 0.35 ? C.danger : dropout.probability >= 0.2 ? C.amber : C.spruce,
                  }} />
                </div>
                <span className="text-sm font-bold" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(dropout.probability * 100)} %
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                {t("dropoutMeta", {
                  n: dropout.trainN ?? 0,
                  base: Math.round((dropout.baseRate ?? 0) * 100),
                  auc: (dropout.trainAuc ?? 0).toFixed(2),
                })}
              </p>
              {(dropout.topFactors?.length ?? 0) > 0 && (
                <p className="text-xs mt-1" style={{ color: C.muted }}>
                  {t("dropoutFactors")}:{" "}
                  {dropout.topFactors!
                    .map((f) => `${featureLabel(f.feature)} (${f.contribution > 0 ? "+" : "−"})`)
                    .join(" · ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs" style={{ color: C.muted }}>{t("dropoutUnavailable")}</p>
          )}
        </div>

        {/* Nearest-neighbor summary — research codes only, never names. */}
        <div className="rounded-lg p-3" style={{ background: C.surfaceAlt }}>
          <p className="text-xs font-bold mb-1" style={{ color: C.ink }}>{t("nnTitle")}</p>
          {nn?.available && nn.neighborSummary ? (
            <>
              <p className="text-xs" style={{ color: C.muted }}>
                {t("nnMeta", { k: nn.k ?? 0, sessions: nn.neighborSummary.medianSessions ?? "—" })}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(nn.neighborSummary.outcomes).map(([reason, count]) => (
                  <span key={reason} className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.surface, border: `1px solid ${C.line}`, color: C.ink }}>
                    {trTerminationReason(reason, lang)}: {count}
                  </span>
                ))}
              </div>
              <p className="text-xs mt-1 break-all" style={{ color: C.muted }}>
                {t("nnCodes")}: {nn.neighborSummary.codes.slice(0, 10).join(", ")}
                {nn.neighborSummary.codes.length > 10 ? ", …" : ""}
              </p>
            </>
          ) : (
            <p className="text-xs" style={{ color: C.muted }}>{t("nnUnavailable")}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
