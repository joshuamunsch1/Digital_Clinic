// Treatment-outcome evaluation over completed (archived, labeled) episodes:
// Jacobson–Truax clinical-significance classification, uncontrolled pre–post
// effect size, termination mix and dose–response — the director's evaluation
// layer (Batch 13). Pure module; the /api/outcomes route feeds it from the
// cached reference sample.
//
// JT conventions here match the per-occasion classifier in
// src/lib/instruments/rci.ts: reliable = |change| STRICTLY above the RCI
// threshold; without rci parameters classification is null (never guessed).
// "recovered" additionally requires crossing the clinical cutoff c into the
// functional side; the PHQ-4 cutoff used in production is a norm-band
// boundary, NOT a derived JT criterion c [clinician-confirm].
import { mean, sd } from "./stats";
import type { ScaleParams, SessionPoint } from "./types";

export type JtCategory = "recovered" | "improved" | "unchanged" | "deteriorated";

export interface OutcomeCaseInput {
  code: string;
  simulated: boolean;
  /// Primary-target series (session or index axis — only order matters here).
  series: SessionPoint[];
  terminationReason: string | null;
  sessionCount: number | null;
  endYear: number | null;
}

export interface OutcomePoint {
  code: string;
  simulated: boolean;
  pre: number;
  post: number;
  /// post − pre, signed, original scale units.
  change: number;
  category: JtCategory | null;
  sessionCount: number | null;
  terminationReason: string | null;
  endYear: number | null;
}

export function classifyJacobsonTruax(
  pre: number,
  post: number,
  scale: ScaleParams,
  clinicalCutoff: number | null,
): JtCategory | null {
  if (scale.rciCutoff === null) return null;
  const diff = post - pre;
  if (Math.abs(diff) <= scale.rciCutoff) return "unchanged";
  const improved = diff > 0 === scale.higherIsBetter;
  if (!improved) return "deteriorated";
  if (clinicalCutoff === null) return "improved"; // no cutoff → recovered collapses into improved
  const functional = scale.higherIsBetter ? post > clinicalCutoff : post < clinicalCutoff;
  return functional ? "recovered" : "improved";
}

export interface OutcomesSummary {
  n: number;
  /// Cases with a non-null JT category (rci-less scales classify nothing).
  classifiable: number;
  categories: Record<JtCategory, number>;
  /// Uncontrolled pre–post effect size, baseline-SD standardized, sign fixed
  /// so POSITIVE d = improvement. Null when n < 2 or preSd = 0.
  effectSize: { d: number; preMean: number; postMean: number; preSd: number; n: number } | null;
  terminationByYear: { year: number; counts: Record<string, number> }[];
  doseResponse: { sessions: number; change: number }[];
}

export interface OutcomesResult {
  points: OutcomePoint[];
  summary: OutcomesSummary;
  /// Cases dropped for having fewer than minMeasurements points.
  excluded: number;
}

export function buildOutcomes(
  cases: OutcomeCaseInput[],
  scale: ScaleParams,
  clinicalCutoff: number | null,
  opts: { minMeasurements?: number } = {},
): OutcomesResult {
  const minMeasurements = opts.minMeasurements ?? 2;
  let excluded = 0;
  const points: OutcomePoint[] = [];
  for (const c of cases) {
    if (c.series.length < minMeasurements) {
      excluded++;
      continue;
    }
    const sorted = [...c.series].sort((a, b) => a.session - b.session);
    const pre = sorted[0].value;
    const post = sorted[sorted.length - 1].value;
    points.push({
      code: c.code,
      simulated: c.simulated,
      pre,
      post,
      change: post - pre,
      category: classifyJacobsonTruax(pre, post, scale, clinicalCutoff),
      sessionCount: c.sessionCount,
      terminationReason: c.terminationReason,
      endYear: c.endYear,
    });
  }

  const categories: Record<JtCategory, number> = { recovered: 0, improved: 0, unchanged: 0, deteriorated: 0 };
  for (const p of points) if (p.category) categories[p.category]++;

  const pres = points.map((p) => p.pre);
  const posts = points.map((p) => p.post);
  const preSd = sd(pres);
  const effectSize =
    points.length >= 2 && preSd > 0
      ? {
          d: ((mean(pres) - mean(posts)) / preSd) * (scale.higherIsBetter ? -1 : 1),
          preMean: mean(pres),
          postMean: mean(posts),
          preSd,
          n: points.length,
        }
      : null;

  const byYear = new Map<number, Record<string, number>>();
  for (const p of points) {
    if (p.endYear === null) continue;
    const counts = byYear.get(p.endYear) ?? {};
    const reason = p.terminationReason ?? "unknown";
    counts[reason] = (counts[reason] ?? 0) + 1;
    byYear.set(p.endYear, counts);
  }
  const terminationByYear = [...byYear.entries()]
    .map(([year, counts]) => ({ year, counts }))
    .sort((a, b) => a.year - b.year);

  const doseResponse = points
    .filter((p): p is OutcomePoint & { sessionCount: number } => p.sessionCount !== null)
    .map((p) => ({ sessions: p.sessionCount, change: p.change }));

  return {
    points,
    summary: {
      n: points.length,
      classifiable: points.filter((p) => p.category !== null).length,
      categories,
      effectSize,
      terminationByYear,
      doseResponse,
    },
    excluded,
  };
}
