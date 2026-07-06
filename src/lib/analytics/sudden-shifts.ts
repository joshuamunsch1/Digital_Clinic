// Sudden gains and sudden losses (Tang & DeRubeis 1999), implemented exactly
// as the `suddengains` R package operationalizes them (Wiedemann, Thew, Stott
// & Ehlers 2020, PMC7062272):
//
//   1. Magnitude:  |Δ| between consecutive sessions ≥ an RCI-based cutoff
//      (modern practice; the original "≥ 7 BDI points" generalizes poorly).
//   2. Relative:   |Δ| ≥ 25% of the pre-shift severity score.
//   3. Stability:  mean(3 sessions before) − mean(3 sessions after) exceeds
//      criticalValue × pooledSD, with criticalValue 2.776 (3+3 sessions
//      present), 3.182 (one side has only 2) and 4.303 (both sides have 2);
//      at least 2 of 3 measurements are required on EACH side; missing
//      sessions are never imputed.
//
// Losses are the mirror image. Detection is SKIPPED (empty result) when the
// scale has no rci parameters — no fabricated psychometrics, matching the
// project convention.
//
// Orientation: everything below runs in *severity* units (higher = worse).
// For higherIsBetter scales the sign is flipped; when the theoretical range is
// known, severity is additionally shifted so the best possible score is 0 —
// otherwise criterion 2's "25% of the pre-shift score" is meaningless for
// scales whose best score is not 0 (e.g. PSTB, −3..+3). Without a range the
// raw severity value is used and criterion 2 only applies when it is positive
// (the same caveat the suddengains package documents for negative values).
import { mean, pooledSd } from "./stats";
import type { ScaleParams, SessionPoint, SuddenShift } from "./types";

/// Two-tailed t critical values (α = .05) by df = nPre + nPost − 2.
const T_CRIT: Record<number, number> = { 4: 2.776, 3: 3.182, 2: 4.303 };

export function detectSuddenShifts(series: SessionPoint[], scale: ScaleParams): SuddenShift[] {
  if (scale.rciCutoff === null || series.length < 4) return [];
  const cutoff = scale.rciCutoff;

  // Severity orientation, anchored at 0 when the range is known.
  const sevBest = scale.range
    ? scale.higherIsBetter
      ? -scale.range.max
      : scale.range.min
    : null;
  const toSev = (v: number) => {
    const sev = scale.higherIsBetter ? -v : v;
    return sevBest === null ? sev : sev - sevBest;
  };

  const bySession = new Map<number, number>();
  for (const p of series) bySession.set(p.session, toSev(p.value));
  const sessions = [...bySession.keys()].sort((a, b) => a - b);

  const shifts: SuddenShift[] = [];
  for (const n of sessions) {
    const next = n + 1;
    const sevN = bySession.get(n)!;
    const sevN1 = bySession.get(next);
    if (sevN1 === undefined) continue; // criterion pairs must be consecutive sessions

    const drop = sevN - sevN1; // positive = improvement (gain direction)
    let kind: "gain" | "loss";
    if (drop >= cutoff) kind = "gain";
    else if (-drop >= cutoff) kind = "loss";
    else continue; // criterion 1 failed

    // Criterion 2: |Δ| ≥ 25% of the pre-shift severity score.
    if (sevBest === null && sevN <= 0) continue; // un-anchored scale, criterion undefined
    if (Math.abs(drop) < 0.25 * sevN) continue;

    // Criterion 3: stability across the surrounding 3-session windows.
    const pre = [n - 2, n - 1, n].filter((s) => bySession.has(s)).map((s) => bySession.get(s)!);
    const post = [next, next + 1, next + 2].filter((s) => bySession.has(s)).map((s) => bySession.get(s)!);
    if (pre.length < 2 || post.length < 2) continue; // ≥ 2 of 3 on each side, no imputation
    const criticalValue = T_CRIT[pre.length + post.length - 2];
    const sdPooled = pooledSd(pre, post);
    const meanPre = mean(pre);
    const meanPost = mean(post);
    const stable =
      kind === "gain"
        ? meanPre - meanPost > criticalValue * sdPooled
        : meanPost - meanPre > criticalValue * sdPooled;
    if (!stable) continue;

    shifts.push({
      kind,
      fromSession: n,
      toSession: next,
      // Report the change in original scale units (signed as stored).
      delta: series.find((p) => p.session === next)!.value - series.find((p) => p.session === n)!.value,
      meanPre,
      meanPost,
      nPre: pre.length,
      nPost: post.length,
      criticalValue,
      pooledSd: sdPooled,
    });
  }
  return shifts;
}
