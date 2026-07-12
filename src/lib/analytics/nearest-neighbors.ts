// Nearest-neighbor expected courses (Lutz, Leach, Barkham, Lambert et al.
// 2005/2006 — a strategy borrowed from avalanche forecasting): instead of one
// global regression, a new patient's expected course is read off the k most
// similar previously treated patients. Similarity is a Gower coefficient over
// the mixed-type intake features (numeric → |a−b|/range, categorical/boolean →
// 0/1 mismatch, missing → the feature is skipped and the rest are averaged —
// Gower's natural missing-data handling).
//
// The DYNAMIC variant additionally matches the patient's observed early
// scores (sessions ≤ dynamicMaxSession) against the same sessions of each
// reference case, so the neighbor set — and with it the expected course and
// the failure boundary — updates as data accrues. This is the nearest-neighbor
// analogue of the Trier Treatment Navigator's dynamic failure boundary.
import { percentile } from "./stats";
import { buildExpectedCourse, type ExpectedCourseOptions } from "./expected-course";
import type { ExpectedCoursePoint, IntakeFeatures, ReferenceCase, ScaleParams, SessionPoint } from "./types";

interface NumericRange {
  min: number;
  max: number;
}

export interface GowerContext {
  /// Observed ranges of the numeric intake features over the reference sample.
  age: NumericRange | null;
  baselineSeverity: NumericRange | null;
  treatmentExpectation: NumericRange | null;
}

function rangeOf(values: (number | null)[]): NumericRange | null {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length < 2) return null;
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

export function gowerContext(cases: IntakeFeatures[]): GowerContext {
  return {
    age: rangeOf(cases.map((c) => c.age)),
    baselineSeverity: rangeOf(cases.map((c) => c.baselineSeverity)),
    treatmentExpectation: rangeOf(cases.map((c) => c.treatmentExpectation)),
  };
}

/// Weighted dissimilarity sum + comparable-feature count over the intake set —
/// the building block that gowerDistance averages and dynamicNeighbors blends
/// with session-score features.
function gowerParts(a: IntakeFeatures, b: IntakeFeatures, ctx: GowerContext): { sum: number; n: number } {
  let sum = 0;
  let n = 0;
  const numeric = (x: number | null, y: number | null, range: NumericRange | null) => {
    if (x === null || y === null || !range || range.max === range.min) return;
    sum += Math.min(1, Math.abs(x - y) / (range.max - range.min));
    n++;
  };
  const categorical = (x: string | boolean | null, y: string | boolean | null) => {
    if (x === null || y === null) return;
    sum += x === y ? 0 : 1;
    n++;
  };
  numeric(a.age, b.age, ctx.age);
  numeric(a.baselineSeverity, b.baselineSeverity, ctx.baselineSeverity);
  numeric(a.treatmentExpectation, b.treatmentExpectation, ctx.treatmentExpectation);
  // Chronicity is a 3-step ordinal → normalized numeric distance over [0, 2].
  numeric(a.problemDuration, b.problemDuration, { min: 0, max: 2 });
  categorical(a.sex, b.sex);
  categorical(a.disorderCategory, b.disorderCategory);
  categorical(a.employment, b.employment);
  categorical(a.priorPsychotherapy, b.priorPsychotherapy);
  categorical(a.psychotropicMedication, b.psychotropicMedication);
  return { sum, n };
}

/// 0 = identical, 1 = maximally different; null when no feature is comparable.
export function gowerDistance(a: IntakeFeatures, b: IntakeFeatures, ctx: GowerContext): number | null {
  const { sum, n } = gowerParts(a, b, ctx);
  return n ? sum / n : null;
}

export interface Neighbor {
  c: ReferenceCase;
  d: number;
}

export function nearestNeighbors(
  target: IntakeFeatures,
  reference: ReferenceCase[],
  k: number,
  ctx: GowerContext = gowerContext(reference.map((r) => r.features)),
): Neighbor[] {
  return reference
    .map((c) => ({ c, d: gowerDistance(target, c.features, ctx) }))
    .filter((x): x is Neighbor => x.d !== null)
    .sort((a, b) => a.d - b.d || a.c.code.localeCompare(b.c.code))
    .slice(0, k);
}

export interface DynamicOptions {
  /// Observed sessions up to here join the similarity (default 6).
  dynamicMaxSession?: number;
  /// Weight of each matched session score relative to one intake feature.
  sessionWeight?: number;
}

/// Neighbor selection that also matches the patient's observed early course.
/// Each observed session ≤ dynamicMaxSession contributes one extra Gower
/// feature: |patient − case| at that session, normalized by the scale range
/// (or the reference spread at that session when no range is known).
export function dynamicNeighbors(
  target: IntakeFeatures,
  observed: SessionPoint[],
  reference: ReferenceCase[],
  k: number,
  seriesKey: string,
  scale: ScaleParams,
  opts: DynamicOptions = {},
): Neighbor[] {
  const maxSession = opts.dynamicMaxSession ?? 6;
  const weight = opts.sessionWeight ?? 1;
  const ctx = gowerContext(reference.map((r) => r.features));
  const early = observed.filter((p) => p.session <= maxSession);

  // Per-session normalizers from the scale range or the reference spread.
  const norm = new Map<number, number>();
  for (const p of early) {
    if (scale.range) {
      norm.set(p.session, scale.range.max - scale.range.min);
    } else {
      const values = reference
        .map((r) => r.series[seriesKey]?.find((q) => q.session === p.session)?.value)
        .filter((v): v is number => v !== undefined);
      const spread = values.length >= 2 ? Math.max(...values) - Math.min(...values) : 0;
      norm.set(p.session, spread);
    }
  }

  return reference
    .map((c) => {
      let { sum, n } = gowerParts(target, c.features, ctx);
      for (const p of early) {
        const v = c.series[seriesKey]?.find((q) => q.session === p.session)?.value;
        const range = norm.get(p.session) ?? 0;
        if (v === undefined || range <= 0) continue;
        sum += weight * Math.min(1, Math.abs(p.value - v) / range);
        n += weight;
      }
      return { c, d: n ? sum / n : null };
    })
    .filter((x): x is Neighbor => x.d !== null)
    .sort((a, b) => a.d - b.d || a.c.code.localeCompare(b.c.code))
    .slice(0, k);
}

export interface NnCourse {
  points: ExpectedCoursePoint[];
  /// Direction-aware worse-tail decile of the neighbors' values per session —
  /// the failure boundary (n-gated at minBoundaryN).
  failureBoundary: { session: number; value: number }[];
}

export interface NnCourseOptions extends ExpectedCourseOptions {
  minBoundaryN?: number;
}

export function nnExpectedCourse(
  neighbors: Neighbor[],
  seriesKey: string,
  scale: ScaleParams,
  opts: NnCourseOptions = {},
): NnCourse {
  const minBoundaryN = opts.minBoundaryN ?? 5;
  const seriesList = neighbors.map((nb) => nb.c.series[seriesKey] ?? []);
  const points = buildExpectedCourse(seriesList, opts);

  const values = new Map<number, number[]>();
  for (const series of seriesList) {
    for (const p of series) {
      const list = values.get(p.session) ?? [];
      list.push(p.value);
      values.set(p.session, list);
    }
  }
  const failureBoundary = Array.from(values.entries())
    .filter(([, xs]) => xs.length >= minBoundaryN)
    .map(([session, xs]) => ({
      session,
      value: percentile(xs, scale.higherIsBetter ? 0.1 : 0.9),
    }))
    .sort((a, b) => a.session - b.session);

  return { points, failureBoundary };
}
