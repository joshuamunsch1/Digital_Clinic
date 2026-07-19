// Pre-treatment + early-course dropout-risk model (the TTN blueprint, Lutz et
// al. 2019 — whose own dropout model explained ~12% of variance with 7
// predictors; expectations for this class of model should be calibrated
// accordingly and the UI reports base rate, n and train-AUC next to every
// probability).
//
// Label: y = 1 iff terminationReason === "dropout" (therapist judgment — the
// clinic's coding decision), y = 0 for "completed" and "mutual"; "transfer"
// and "other" are EXCLUDED from training — they are neither successful
// completions nor dropouts. Features: the encoded intake set (features.ts)
// plus the case's own early-change classification, computed with the same
// pipeline that runs on live patients — so the model trains identically on
// real data once the simulated cohort is purged.
import type { AttendanceFeatures } from "./attendance";
import { classifyEarlyChange } from "./early-change";
import { applyStandardization, encodeFeatures, imputeStandardize } from "./features";
import { auc, predictLogistic, trainLogistic, type LogisticOptions } from "./logistic";
import type { EarlyChange, IntakeFeatures, ReferenceCase, ScaleParams } from "./types";

export interface DropoutModel {
  featureNames: string[];
  means: number[];
  sds: number[];
  weights: number[];
  bias: number;
  n: number;
  baseRate: number;
  trainAuc: number;
}

const MIN_LABELED = 40;
const MIN_PER_CLASS = 5;

const EARLY_FEATURES = ["early_response", "early_deterioration"] as const;

/// Ledger-derived attendance rates (Batch 13). Including them is a
/// feature-selection decision, not a psychometric fact [clinician-confirm];
/// the panel's base-rate/n/AUC display keeps the model honest either way.
const ATTENDANCE_FEATURES = ["cancellation_rate", "no_show_rate", "unmeasured_held_rate"] as const;

function earlyOneHots(early: EarlyChange | null): (number | null)[] {
  if (early === null) return [null, null];
  return [early === "early_response" ? 1 : 0, early === "early_deterioration" ? 1 : 0];
}

function attendanceCells(a: AttendanceFeatures | null): (number | null)[] {
  // Unavailable ledger → all-null cells → mean imputation downstream, exactly
  // like missing intake fields — never silently zeroed.
  if (!a || !a.available) return [null, null, null];
  return [a.cancellationRate, a.noShowRate, a.unmeasuredHeldRate];
}

function rawRow(
  features: IntakeFeatures,
  early: EarlyChange | null,
  attendance: AttendanceFeatures | null,
): { names: string[]; values: (number | null)[] } {
  const base = encodeFeatures(features);
  return {
    names: [...base.names, ...EARLY_FEATURES, ...ATTENDANCE_FEATURES],
    values: [...base.values, ...earlyOneHots(early), ...attendanceCells(attendance)],
  };
}

export function trainDropoutModel(
  cases: ReferenceCase[],
  seriesKey: string,
  scale: ScaleParams,
  opts: LogisticOptions = {},
): DropoutModel | null {
  const labeled = cases
    .filter((c) => c.terminationReason === "dropout" || c.terminationReason === "completed" || c.terminationReason === "mutual")
    .map((c) => ({
      c,
      y: c.terminationReason === "dropout" ? 1 : 0,
      early: classifyEarlyChange(c.series[seriesKey] ?? [], scale),
    }));
  const nPos = labeled.filter((l) => l.y === 1).length;
  const nNeg = labeled.length - nPos;
  if (labeled.length < MIN_LABELED || nPos < MIN_PER_CLASS || nNeg < MIN_PER_CLASS) return null;

  const rows = labeled.map((l) => rawRow(l.c.features, l.early, l.c.attendance));
  const featureNames = rows[0].names;
  const { X, means, sds } = imputeStandardize(rows.map((r) => r.values));
  const y = labeled.map((l) => l.y);
  const fit = trainLogistic(X, y, opts);
  const scores = X.map((x) => predictLogistic(fit, x));
  return {
    featureNames,
    means,
    sds,
    weights: fit.weights,
    bias: fit.bias,
    n: labeled.length,
    baseRate: nPos / labeled.length,
    trainAuc: auc(scores, y),
  };
}

export interface DropoutPrediction {
  probability: number;
  /// Top standardized contributions (weight × standardized value), signed —
  /// positive pushes toward dropout. For the honest "why" display.
  topFactors: { feature: string; contribution: number }[];
}

export function predictDropoutRisk(
  model: DropoutModel,
  features: IntakeFeatures,
  early: EarlyChange | null,
  attendance: AttendanceFeatures | null,
  topK = 3,
): DropoutPrediction {
  const { values } = rawRow(features, early, attendance);
  const x = applyStandardization(values, model);
  const probability = predictLogistic({ weights: model.weights, bias: model.bias }, x);
  const topFactors = x
    .map((v, j) => ({ feature: model.featureNames[j], contribution: v * model.weights[j] }))
    .filter((f) => Math.abs(f.contribution) > 1e-9)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, topK);
  return { probability, topFactors };
}
