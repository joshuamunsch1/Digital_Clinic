// Expected Treatment Response (Lutz, Martinovich & Howard 1999): log-linear
// growth curves with intake characteristics predicting intercept and slope.
//
// HONEST LIMITATION, stated everywhere this model surfaces: the original ETR
// is a multilevel (random-effects) model. What is implemented here is the
// transparent TWO-STAGE approximation — stage A fits each completed case's own
// OLS line y = a + b·ln(session + 1); stage B regresses the per-case (a, b)
// on the encoded intake features. No shrinkage, no uncertainty band: an
// approximation ("Näherung, kein validiertes ETR"), not a validated ETR. It
// exists so the expected-value curve is available; the percentile bands and
// nearest-neighbor courses remain the primary decision-support surfaces.
import { olsFit } from "./stats";
import { applyStandardization, encodeFeatures, imputeStandardize } from "./features";
import type { IntakeFeatures, SessionPoint } from "./types";

export interface LogLinearFit {
  intercept: number;
  slope: number;
}

/// Stage A: per-patient OLS of value on ln(session + 1). Needs ≥ 3 points and
/// ≥ 2 distinct sessions.
export function fitLogLinear(series: SessionPoint[]): LogLinearFit | null {
  if (series.length < 3) return null;
  const x = series.map((p) => Math.log(p.session + 1));
  if (new Set(x).size < 2) return null;
  const beta = olsFit(x.map((v) => [v]), series.map((p) => p.value));
  if (!beta) return null;
  return { intercept: beta[0], slope: beta[1] };
}

export interface EtrModel {
  featureNames: string[];
  means: number[];
  sds: number[];
  /// [intercept, ...perFeature] over standardized features.
  interceptCoefs: number[];
  slopeCoefs: number[];
  /// Fittable cases stage B was trained on.
  n: number;
}

export interface EtrTrainingCase {
  features: IntakeFeatures;
  series: SessionPoint[];
}

const MIN_CASES = 30;

export function trainEtr(cases: EtrTrainingCase[]): EtrModel | null {
  const fitted = cases
    .map((c) => ({ c, fit: fitLogLinear(c.series) }))
    .filter((x): x is { c: EtrTrainingCase; fit: LogLinearFit } => x.fit !== null);
  if (fitted.length < MIN_CASES) return null;

  const encoded = fitted.map((x) => encodeFeatures(x.c.features));
  const featureNames = encoded[0].names;
  const { X, means, sds } = imputeStandardize(encoded.map((e) => e.values));
  const interceptCoefs = olsFit(X, fitted.map((x) => x.fit.intercept));
  const slopeCoefs = olsFit(X, fitted.map((x) => x.fit.slope));
  if (!interceptCoefs || !slopeCoefs) return null;
  return { featureNames, means, sds, interceptCoefs, slopeCoefs, n: fitted.length };
}

export function predictEtr(
  model: EtrModel,
  features: IntakeFeatures,
  sessions: number[],
): { session: number; expected: number }[] {
  const x = applyStandardization(encodeFeatures(features).values, model);
  const dot = (coefs: number[]) => coefs[0] + x.reduce((s, v, j) => s + v * coefs[j + 1], 0);
  const a = dot(model.interceptCoefs);
  const b = dot(model.slopeCoefs);
  return sessions.map((session) => ({ session, expected: a + b * Math.log(session + 1) }));
}
