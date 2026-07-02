// Reliable Change Index (Jacobson & Truax, 1991).
//
// For a scale with test-retest reliability r and norm standard deviation SD:
//   SE_measurement = SD · √(1 − r)
//   SE_difference  = SE_measurement · √2  =  SD · √2 · √(1 − r)
// A change between two measurements is "reliable" (unlikely to be measurement
// noise) at the 95% level when |x2 − x1| > 1.96 · SE_difference.
//
// We compare every occasion to the patient's FIRST measurement of the scale
// (baseline-anchored, the convention used in therapy outcome monitoring), and
// classify it as reliable improvement or deterioration using the scale's
// higherIsBetter direction.
import type { ScaleDef } from "./types";

export type RciClass = "improved" | "deteriorated" | "unchanged";

export function rciThreshold(rci: NonNullable<ScaleDef["rci"]>): number {
  const seDiff = rci.sd * Math.SQRT2 * Math.sqrt(1 - rci.reliability);
  return 1.96 * seDiff;
}

export function classifyChange(scale: ScaleDef, baseline: number, value: number): RciClass {
  if (!scale.rci) return "unchanged";
  const diff = value - baseline;
  if (Math.abs(diff) <= rciThreshold(scale.rci)) return "unchanged";
  const higherIsBetter = scale.higherIsBetter ?? true;
  return diff > 0 === higherIsBetter ? "improved" : "deteriorated";
}
