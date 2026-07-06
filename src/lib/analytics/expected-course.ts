// Empirical expected-course bands (docs/outcome-prediction.md Stage 1 item 3,
// Stage 2 stratification) and the not-on-track classifier (Stage 1 item 4).
//
// The band is nothing more than per-occasion percentiles {p25, p50, p75}
// pooled from the reference sample — no fabricated norms. Every point carries
// its n; occasions with fewer than minN reference cases are omitted entirely
// (the chart shows a gap, not a guess).
import { percentile } from "./stats";
import type { ExpectedCoursePoint, OnTrackResult, ScaleParams, SessionPoint } from "./types";

export interface ExpectedCourseOptions {
  /// Minimum reference cases per occasion for the band to exist there.
  minN?: number;
  /// Hard ceiling on the session axis (safety against outlier-long series).
  maxSession?: number;
}

export function buildExpectedCourse(
  reference: SessionPoint[][],
  opts: ExpectedCourseOptions = {},
): ExpectedCoursePoint[] {
  const minN = opts.minN ?? 3;
  const maxSession = opts.maxSession ?? 60;
  const values = new Map<number, number[]>();
  for (const series of reference) {
    for (const p of series) {
      if (p.session > maxSession) continue;
      const list = values.get(p.session) ?? [];
      list.push(p.value);
      values.set(p.session, list);
    }
  }
  return Array.from(values.entries())
    .filter(([, xs]) => xs.length >= minN)
    .map(([session, xs]) => ({
      session,
      n: xs.length,
      p25: percentile(xs, 0.25),
      p50: percentile(xs, 0.5),
      p75: percentile(xs, 0.75),
    }))
    .sort((a, b) => a.session - b.session);
}

export interface StratifiedCourse {
  points: ExpectedCoursePoint[];
  /// True when the band comes from the patient's severity tertile rather than
  /// the pooled sample.
  stratified: boolean;
  stratum?: 0 | 1 | 2;
  /// Cases feeding the band (stratum size when stratified, else cohort size).
  cases: number;
}

export interface StratifyOptions extends ExpectedCourseOptions {
  /// Total labeled cases required before stratifying at all (Stage 2 gate).
  minCohort?: number;
  /// Cases required inside the patient's tertile.
  minPerStratum?: number;
}

/// Stage 2: expected course stratified by initial severity — the single most
/// important ETR predictor. Tertile boundaries come from the reference
/// baselines; the patient is assigned by their own baseline. Falls back to the
/// pooled band whenever a gate fails (small cohort, thin stratum, unknown
/// patient baseline).
export function stratifiedExpectedCourse(
  reference: { baseline: number; series: SessionPoint[] }[],
  patientBaseline: number | null,
  opts: StratifyOptions = {},
): StratifiedCourse {
  const minCohort = opts.minCohort ?? 30;
  const minPerStratum = opts.minPerStratum ?? 8;
  const pooled = () => ({
    points: buildExpectedCourse(reference.map((r) => r.series), opts),
    stratified: false as const,
    cases: reference.length,
  });
  if (patientBaseline === null || reference.length < minCohort) return pooled();

  const baselines = reference.map((r) => r.baseline);
  const t1 = percentile(baselines, 1 / 3);
  const t2 = percentile(baselines, 2 / 3);
  const stratumOf = (b: number): 0 | 1 | 2 => (b <= t1 ? 0 : b <= t2 ? 1 : 2);
  const stratum = stratumOf(patientBaseline);
  const members = reference.filter((r) => stratumOf(r.baseline) === stratum);
  if (members.length < minPerStratum) return pooled();
  return {
    points: buildExpectedCourse(members.map((r) => r.series), opts),
    stratified: true,
    stratum,
    cases: members.length,
  };
}

export interface OnTrackOptions {
  /// Consecutive measured occasions outside the band required for the flag.
  consecutive?: number;
}

/// The amber "not on track" signal (Stage 1 item 4): the patient sits on the
/// WORSE side of the band (direction-aware: below p25 when higher is better,
/// above p75 otherwise) for ≥ 2 consecutive measured occasions that have a
/// band — OR shows baseline-anchored reliable deterioration on the latest
/// measurement. "unknown" when neither signal is computable. Deliberately a
/// distinct signal from the red safety alerts.
export function classifyOnTrack(
  series: SessionPoint[],
  course: ExpectedCoursePoint[],
  scale: ScaleParams,
  opts: OnTrackOptions = {},
): OnTrackResult {
  const needed = opts.consecutive ?? 2;
  const band = new Map(course.map((p) => [p.session, p]));
  const sorted = [...series].sort((a, b) => a.session - b.session);

  const reasons: OnTrackResult["reasons"] = [];
  let streak = 0;
  let bandComparisons = 0;
  for (const p of sorted) {
    const b = band.get(p.session);
    // Only banded occasions count; un-banded ones neither extend nor reset
    // the streak (a band gap must not silence an ongoing deterioration).
    if (!b) continue;
    bandComparisons++;
    const worse = scale.higherIsBetter ? p.value < b.p25 : p.value > b.p75;
    streak = worse ? streak + 1 : 0;
    if (streak >= needed) {
      reasons.push("below_band");
      break;
    }
  }

  let rciComparable = false;
  if (scale.rciCutoff !== null && sorted.length >= 2) {
    rciComparable = true;
    const baseline = sorted[0].value;
    const latest = sorted[sorted.length - 1].value;
    const deteriorated = scale.higherIsBetter
      ? baseline - latest >= scale.rciCutoff
      : latest - baseline >= scale.rciCutoff;
    if (deteriorated) reasons.push("rci_deterioration");
  }

  if (reasons.length) return { status: "not_on_track", reasons };
  if (bandComparisons === 0 && !rciComparable) return { status: "unknown", reasons: [] };
  return { status: "on_track", reasons: [] };
}
