// Pure derivations for the caseload cockpit (Batch 13) — the Lambert-style
// traffic-light feedback table. Kept out of the component so the precedence
// logic is unit-testable.
import type { EarlyChange, OnTrackResult, SessionPoint } from "./types";

export type CockpitLight = "red" | "amber" | "green" | "grey";

export interface CockpitSummaryInput {
  earlyChange: EarlyChange | null;
  onTrack: OnTrackResult["status"];
  dropoutRisk: number | null;
}

/// Traffic-light precedence: red (safety alert) > amber (not-on-track OR
/// early deterioration) > green (on track) > grey (no/insufficient data).
/// Folding early_deterioration into amber is a triage policy, not a
/// psychometric fact [clinician-confirm].
export function statusLight(alertCount: number, summary: CockpitSummaryInput | undefined): CockpitLight {
  if (alertCount > 0) return "red";
  if (!summary) return "grey";
  if (summary.onTrack === "not_on_track" || summary.earlyChange === "early_deterioration") return "amber";
  if (summary.onTrack === "on_track") return "green";
  return "grey";
}

export interface LatestPrimary {
  value: number | null;
  /// Signed change vs. the previous measurement; null with fewer than 2 points.
  delta: number | null;
  session: number | null;
}

export function latestPrimary(series: SessionPoint[]): LatestPrimary {
  if (!series.length) return { value: null, delta: null, session: null };
  const sorted = [...series].sort((a, b) => a.session - b.session);
  const last = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  return { value: last.value, delta: prev ? last.value - prev.value : null, session: last.session };
}

/// Whole days between an ISO timestamp and now; null for null input.
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now.getTime() - at) / 864e5));
}
