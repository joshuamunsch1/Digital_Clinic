// Early change (docs/outcome-prediction.md §1.7 / Stage 1 item 2): reliable
// improvement within the first handful of sessions predicts good outcome;
// early deterioration predicts failure and dropout better than any intake
// variable. Classification is RCI-based: baseline → the latest measured
// session ≤ maxSession, compared against the scale's reliable-change cutoff.
// Returns null (not "indeterminate") when the classification cannot be made
// at all — no baseline, no early measurement, or no rci parameters.
import type { EarlyChange, ScaleParams, SessionPoint } from "./types";

export interface EarlyChangeOptions {
  /// Latest session that still counts as "early" (default 4).
  maxSession?: number;
}

export function classifyEarlyChange(
  series: SessionPoint[],
  scale: ScaleParams,
  opts: EarlyChangeOptions = {},
): EarlyChange | null {
  if (scale.rciCutoff === null) return null;
  const maxSession = opts.maxSession ?? 4;
  const sorted = [...series].sort((a, b) => a.session - b.session);
  const baseline = sorted[0];
  if (!baseline) return null;
  const early = [...sorted]
    .filter((p) => p.session > baseline.session && p.session <= maxSession)
    .pop();
  if (!early) return null;

  const delta = early.value - baseline.value;
  const improved = scale.higherIsBetter ? delta : -delta;
  if (improved >= scale.rciCutoff) return "early_response";
  if (-improved >= scale.rciCutoff) return "early_deterioration";
  return "indeterminate";
}
