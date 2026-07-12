// Item-level answer generation for the simulated cohort. The simulation never
// writes scale scores directly — it fabricates ITEM answers around the target
// values and lets the real scoring engine (computeScaleScores) do the rest,
// exactly like live submissions and the demo seed. Generalizes the
// deterministic-wobble pattern of demo.ts with the seeded RNG.
import type { RawAnswers } from "../instruments/types";
import { clampNum, normal, uniformInt, type Rng } from "./rng";

const PSTB_REVERSED = new Set(["I8", "I12", "I14", "I19"]);

/// PHQ-4: four 0–3 items whose sum lands exactly on round(targetTotal).
export function phq4Answers(rng: Rng, targetTotal: number): RawAnswers {
  const target = Math.round(clampNum(targetTotal, 0, 12));
  const values = [0, 0, 0, 0].map(() => clampNum(Math.round(target / 4 + normal(rng, 0, 0.5)), 0, 3));
  let diff = target - values.reduce((s, v) => s + v, 0);
  let guard = 40;
  while (diff !== 0 && guard-- > 0) {
    const i = uniformInt(rng, 0, 3);
    if (diff > 0 && values[i] < 3) {
      values[i]++;
      diff--;
    } else if (diff < 0 && values[i] > 0) {
      values[i]--;
      diff++;
    }
  }
  const answers: RawAnswers = {};
  values.forEach((v, i) => (answers[`PHQ${i + 1}`] = v));
  return answers;
}

/// PSTB: 22 items −3..+3 around the target mean; reverse items are stored
/// raw/unrecoded (the engine flips them), matching the legacy data layout.
export function pstbAnswers(rng: Rng, targetMean: number): RawAnswers {
  const answers: RawAnswers = {};
  for (let item = 1; item <= 22; item++) {
    const id = `I${item}`;
    const val = clampNum(Math.round(targetMean + normal(rng, 0, 0.8)), -3, 3);
    answers[id] = PSTB_REVERSED.has(id) ? -val : val;
  }
  return answers;
}

/// BDI-FS: 7 items 0–3 from an overall severity in [0, 1]. The suicide item
/// (BDI7 — the safety-alert trigger) is always 0 in simulated data.
export function bdiFsAnswers(rng: Rng, severity01: number): RawAnswers {
  const perItem = clampNum(severity01, 0, 1) * 3;
  const answers: RawAnswers = {};
  const ids = [
    "BDI1_Traurigkeit",
    "BDI2_Pessimismus",
    "BDI3_Versagen",
    "BDI4_Freudeverlust",
    "BDI5_Selbstablehnung",
    "BDI6_Selbstkritik",
  ];
  for (const id of ids) answers[id] = clampNum(Math.round(perItem + normal(rng, 0, 0.5)), 0, 3);
  answers.BDI7_Suizid = 0;
  return answers;
}
