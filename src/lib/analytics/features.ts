// Shared encoding of intake features into a numeric design matrix — used by
// the two-stage ETR growth model and the dropout-risk logistic regression so
// both consume identical inputs (and so will any future model).
import { mean, sd } from "./stats";
import { DISORDER_CATEGORIES } from "../types";
import type { IntakeFeatures } from "./types";

export const EMPLOYMENT_KEYS = ["employed", "in_training", "unemployed", "retired", "other"] as const;

export interface EncodedFeatures {
  names: string[];
  /// null = missing (imputed downstream, never silently zeroed).
  values: (number | null)[];
}

export function encodeFeatures(f: IntakeFeatures): EncodedFeatures {
  const names: string[] = [];
  const values: (number | null)[] = [];
  const push = (name: string, v: number | null) => {
    names.push(name);
    values.push(v);
  };
  push("age", f.age);
  push("baseline_severity", f.baselineSeverity);
  push("treatment_expectation", f.treatmentExpectation);
  push("problem_duration", f.problemDuration);
  push("prior_psychotherapy", f.priorPsychotherapy === null ? null : f.priorPsychotherapy ? 1 : 0);
  push("psychotropic_medication", f.psychotropicMedication === null ? null : f.psychotropicMedication ? 1 : 0);
  push("sex_male", f.sex === null ? null : f.sex === "Male" ? 1 : 0);
  for (const k of EMPLOYMENT_KEYS) push(`employment_${k}`, f.employment === null ? null : f.employment === k ? 1 : 0);
  for (const c of DISORDER_CATEGORIES) push(`category_${c}`, f.disorderCategory === null ? null : f.disorderCategory === c ? 1 : 0);
  return { names, values };
}

export interface Standardization {
  means: number[];
  sds: number[];
}

/// Mean-impute missing cells, then z-standardize each column (constant columns
/// get sd 1 so they standardize to 0 instead of dividing by zero). Returns the
/// transform so prediction-time inputs standardize identically.
export function imputeStandardize(rows: (number | null)[][]): { X: number[][]; means: number[]; sds: number[] } {
  const p = rows[0]?.length ?? 0;
  const means: number[] = new Array(p).fill(0);
  const sds: number[] = new Array(p).fill(1);
  for (let j = 0; j < p; j++) {
    const col = rows.map((r) => r[j]).filter((v): v is number => v !== null);
    means[j] = col.length ? mean(col) : 0;
    const s = col.length ? sd(col) : 0;
    sds[j] = s > 1e-9 ? s : 1;
  }
  const X = rows.map((r) => r.map((v, j) => ((v ?? means[j]) - means[j]) / sds[j]));
  return { X, means, sds };
}

/// Standardize one prediction-time row with a stored transform (missing →
/// column mean → 0 after standardization).
export function applyStandardization(values: (number | null)[], t: Standardization): number[] {
  return values.map((v, j) => ((v ?? t.means[j]) - t.means[j]) / t.sds[j]);
}
