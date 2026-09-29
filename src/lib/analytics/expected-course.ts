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
  /// Pooling half-width for sparse, irregularly timed axes (the BDI-FS weeks
  /// axis, Batch 16). 0 (default) = exact occasions only. With w > 0, every
  /// integer x gets, per reference case, the ONE point nearest to x within
  /// ±w (ties → the earlier point) — each case counts at most once per x, so
  /// n stays a count of cases, and a real gap (no case within ±w) stays a gap.
  window?: number;
}

/// Reference values per occasion (exact, or nearest-within-window pooled).
/// Shared by the band and the NN failure boundary so both use one definition.
export function pooledValues(reference: SessionPoint[][], opts: ExpectedCourseOptions = {}): Map<number, number[]> {
  const maxSession = opts.maxSession ?? 60;
  const window = opts.window ?? 0;
  const values = new Map<number, number[]>();
  if (window <= 0) {
    for (const series of reference) {
      for (const p of series) {
        if (p.session > maxSession) continue;
        const list = values.get(p.session) ?? [];
        list.push(p.value);
        values.set(p.session, list);
      }
    }
    return values;
  }
  let maxX = 0;
  for (const series of reference) for (const p of series) if (p.session > maxX) maxX = p.session;
  maxX = Math.min(maxX, maxSession);
  for (let x = 0; x <= maxX; x++) {
    const list: number[] = [];
    for (const series of reference) {
      let best: SessionPoint | null = null;
      for (const p of series) {
        const d = Math.abs(p.session - x);
        if (d > window) continue;
        if (!best || d < Math.abs(best.session - x) || (d === Math.abs(best.session - x) && p.session < best.session)) best = p;
      }
      if (best) list.push(best.value);
    }
    if (list.length) values.set(x, list);
  }
  return values;
}

export function buildExpectedCourse(
  reference: SessionPoint[][],
  opts: ExpectedCourseOptions = {},
): ExpectedCoursePoint[] {
  const minN = opts.minN ?? 3;
  return Array.from(pooledValues(reference, opts).entries())
    .filter(([, xs]) => xs.length >= minN)
    .map(([session, xs]) => ({
      session,
      n: xs.length,
      p10: percentile(xs, 0.1),
      p25: percentile(xs, 0.25),
      p50: percentile(xs, 0.5),
      p75: percentile(xs, 0.75),
      p90: percentile(xs, 0.9),
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

/// The amber "not on track" signal (Stage 1 item 4): the patient crosses the
/// 80% tolerance boundary (direction-aware: below p10 when higher is better,
/// above p90 otherwise — Finch/Lambert/Anderson-style failure boundary) for
/// ≥ 2 consecutive measured occasions that have a band — OR shows
/// baseline-anchored reliable deterioration on the latest measurement.
/// "unknown" when neither signal is computable. Deliberately a distinct
/// signal from the red safety alerts.
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
  // CURRENT status, not history: the flag reflects the trailing run of banded
  // occasions ending at the most recent one. A patient who dipped outside the
  // boundary at sessions 3–4 but has been back inside ever since is on track
  // again (Lambert-style feedback re-evaluates every session); a streak that
  // ended in the past must not pin the amber banner forever. Only banded
  // occasions count; un-banded gaps neither extend nor break the trailing run.
  const banded = sorted.filter((p) => band.has(p.session));
  let tailStreak = 0;
  for (let i = banded.length - 1; i >= 0; i--) {
    const b = band.get(banded[i].session)!;
    const worse = scale.higherIsBetter ? banded[i].value < b.p10 : banded[i].value > b.p90;
    if (!worse) break;
    tailStreak++;
  }
  if (tailStreak >= needed) reasons.push("below_band");
  const bandComparisons = banded.length;

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
