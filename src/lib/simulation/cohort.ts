// Generative model for the synthetic reference cohort (docs/outcome-prediction.md
// — "implement all stages with simulated data standing in for the archive").
//
// The point is not cosmetic realism but PLANTED SIGNAL: the intake predictors
// enter the improvement slope and the dropout mechanism the same way the
// Lutz literature reports, so ETR stage B, nearest neighbors and the dropout
// model have something real to recover — and the sanity test asserts they do.
//
// Model, in severity units of the PHQ-4 total (0–12):
//   baseline   b0 = clamp(N(7.2, 2.2) + 0.6·chronicity + 0.5·medication, 2, 12)
//   slope      β  = clamp(N(1.85, .5) + .09·(expectation−5) − .45·I(>24m)
//                         − .25·I(priorTx) + .15·I(employed) − .20·I(meds), .1, 3.5)
//   course     y(s) = clamp(b0 − β·ln(s+1) + step(s) + ε_s, 0, 12), ε ~ N(0, 1.05)
//   sudden gains (~20% of cases): one negative step at g ∈ U{3..8}, sized to
//   clear the RCI cutoff + the 25% criterion, with damped noise (σ = .5) in
//   the ±3-session windows so the stability criterion usually passes; sudden
//   losses (~5%) mirrored at g ∈ U{4..10}.
//   dropout    p = σ(−2.0 + 1.6·I(early deterioration) + .7·I(indeterminate)
//                    + .7·I(>24m) + .7·I(unemployed) − .18·(expectation−5)
//                    + .35·I(meds))  → truncation at U{4..12} sessions
//   PSTB coupling: pstb(s) = clamp(3 − y(s)/2 + N(0, .35), −3, 3)
import { classifyEarlyChange } from "../analytics/early-change";
import type { EarlyChange, ScaleParams } from "../analytics/types";
import type { CaseCharacteristics, TerminationReason } from "../types";
import { bernoulli, categorical, clampNum, mulberry32, normal, uniformInt, type Rng } from "./rng";

export const SIM_MASTER_SEED = 20260706;

/// PHQ-4 total ScaleParams as seeded in the catalog (rci: r=.82, sd=2.5 →
/// cutoff ≈ 2.94). Kept in sync manually; the sanity test only relies on the
/// planted steps clearing this cutoff.
export const SIM_PHQ_SCALE: ScaleParams = {
  higherIsBetter: false,
  rciCutoff: 1.96 * 2.5 * Math.SQRT2 * Math.sqrt(1 - 0.82),
  range: { min: 0, max: 12 },
};

export interface SimSession {
  /// Therapy session index (0 = baseline). Gaps exist where a session was
  /// held without questionnaires.
  index: number;
  date: Date;
  /// null when the session was held but NOT measured (SessionLog "held").
  phqTarget: number | null;
  pstbTarget: number | null;
}

export interface SimExtraLog {
  date: Date;
  type: "cancelled" | "no_show";
}

export interface SimCase {
  index: number;
  firstName: string;
  lastName: string;
  sex: string;
  age: number;
  disorderCategory: string;
  icd: string;
  caseCharacteristics: Required<CaseCharacteristics>;
  therapistId: string;
  terminationReason: TerminationReason;
  treatmentStart: Date;
  treatmentEnd: Date;
  sessions: SimSession[];
  extraLogs: SimExtraLog[];
  /// Wave-based BDI-FS severities (0..1 of scale max) or null.
  bdiWaves: { wave: "pre" | "zm" | "post"; date: Date; severity01: number }[] | null;
  // Ground truth for the sanity tests:
  dropout: boolean;
  plantedGain: boolean;
  plantedLoss: boolean;
  earlyChange: EarlyChange | null;
}

const FIRST_NAMES_F = ["Anna", "Laura", "Julia", "Sarah", "Nina", "Lena", "Mia", "Elena", "Sophie", "Clara", "Eva", "Miriam", "Katrin", "Selina", "Fabienne", "Corinne", "Vera", "Ruth", "Iris", "Silvia"];
const FIRST_NAMES_M = ["Lukas", "David", "Jonas", "Simon", "Marc", "Stefan", "Thomas", "Daniel", "Michael", "Pascal", "Reto", "Beat", "Urs", "Christian", "Matthias", "Adrian", "Roman", "Felix", "Samuel", "Nicolas"];
const LAST_NAMES = ["Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Schneider", "Meyer", "Steiner", "Fischer", "Gerber", "Brunner", "Baumann", "Frei", "Zimmermann", "Moser", "Widmer", "Wyss", "Graf", "Roth", "Suter", "Kunz", "Marti", "Lehmann", "Kaufmann"];

const ICD_POOLS: Record<string, string[]> = {
  depression: ["F32.1", "F32.2", "F33.1", "F33.2"],
  anxiety: ["F41.0", "F41.1", "F40.1", "F40.01", "F41.2"],
  burnout: ["Z73.0", "F43.0"],
  eating_disorder: ["F50.0", "F50.1", "F50.2"],
  adhd: ["F90.0", "F90.1"],
  other: ["F43.2", "F45.1", "F42.9"],
};

const DIAGNOSIS_TEXT: Record<string, string> = {
  depression: "Depressive Episode (simulierter Fall)",
  anxiety: "Angststörung (simulierter Fall)",
  burnout: "Erschöpfungssyndrom (simulierter Fall)",
  eating_disorder: "Essstörung (simulierter Fall)",
  adhd: "ADHS (simulierter Fall)",
  other: "Weitere Diagnose (simulierter Fall)",
};

export const simDiagnosisText = (category: string): string => DIAGNOSIS_TEXT[category] ?? DIAGNOSIS_TEXT.other;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

const DAY = 864e5;

export interface CohortOptions {
  seed?: number;
  therapistIds?: string[];
}

export function generateCohort(n: number, opts: CohortOptions = {}): SimCase[] {
  const rng = mulberry32(opts.seed ?? SIM_MASTER_SEED);
  const therapists = opts.therapistIds ?? ["t1", "t2", "t3"];
  const cases: SimCase[] = [];
  // Treatment END dates spread deterministically over 2023-01 … 2026-05.
  const endWindowStart = new Date("2023-01-15T10:00:00.000Z").getTime();
  const endWindowDays = Math.floor((new Date("2026-05-15T10:00:00.000Z").getTime() - endWindowStart) / DAY);

  for (let i = 0; i < n; i++) {
    // --- Intake features -----------------------------------------------------
    const sex = categorical(rng, [["Female", 0.58], ["Male", 0.4], ["Non-binary", 0.02]]);
    const age = Math.round(clampNum(normal(rng, 38, 12), 18, 75));
    const disorderCategory = categorical(rng, [
      ["depression", 0.3], ["anxiety", 0.3], ["burnout", 0.12],
      ["eating_disorder", 0.1], ["adhd", 0.08], ["other", 0.1],
    ]);
    const problemDuration = categorical(rng, [["lt6m", 0.25], ["m6to24", 0.4], ["gt24m", 0.35]] as [
      "lt6m" | "m6to24" | "gt24m", number,
    ][]);
    const durOrd = problemDuration === "lt6m" ? 0 : problemDuration === "m6to24" ? 1 : 2;
    const priorPsychotherapy = bernoulli(rng, 0.45);
    const psychotropicMedication = bernoulli(rng, 0.35);
    const employment = categorical(rng, [
      ["employed", 0.55], ["in_training", 0.12], ["unemployed", 0.15], ["retired", 0.08], ["other", 0.1],
    ] as ["employed" | "in_training" | "unemployed" | "retired" | "other", number][]);
    const treatmentExpectation = Math.round(clampNum(normal(rng, 6.5, 2), 0, 10));

    // --- True course ---------------------------------------------------------
    const b0 = clampNum(normal(rng, 7.2, 2.2) + 0.6 * durOrd + 0.5 * (psychotropicMedication ? 1 : 0), 2, 12);
    let beta = clampNum(
      normal(rng, 1.85, 0.5) +
        0.09 * (treatmentExpectation - 5) -
        0.45 * (durOrd === 2 ? 1 : 0) -
        0.25 * (priorPsychotherapy ? 1 : 0) +
        0.15 * (employment === "employed" ? 1 : 0) -
        0.2 * (psychotropicMedication ? 1 : 0),
      0.1,
      3.5,
    );

    const cutoff = SIM_PHQ_SCALE.rciCutoff!;
    // ~8% early deteriorators (the group the feedback literature is about):
    // barely-responding slope plus a persistent early worsening bump large
    // enough to cross the RCI deterioration threshold despite noise.
    const earlyDeteriorator = bernoulli(rng, 0.08);
    const detBump = earlyDeteriorator ? cutoff + 1 + rng() * 1.5 : 0;
    if (earlyDeteriorator) beta = clampNum(beta, 0.1, 0.5);

    const plannedLength = Math.round(clampNum(normal(rng, 20, 8), 8, 45));
    const plantedGain = !earlyDeteriorator && bernoulli(rng, 0.2);
    const plantedLoss = !earlyDeteriorator && !plantedGain && bernoulli(rng, 0.0625); // ≈ 5% overall
    const gainAt = plantedGain ? uniformInt(rng, 3, Math.min(8, plannedLength - 4)) : null;
    const lossAt = plantedLoss ? uniformInt(rng, 4, Math.min(10, plannedLength - 4)) : null;

    const expected = (s: number) => clampNum(b0 - beta * Math.log(s + 1), 0, 12);
    const gainSize = gainAt !== null ? Math.max(cutoff + 0.5, 0.3 * expected(gainAt)) + rng() * 0.8 : 0;
    const lossSize = lossAt !== null ? Math.max(cutoff + 0.5, 2.5) + rng() * 0.8 : 0;
    const step = (s: number) =>
      (gainAt !== null && s > gainAt ? -gainSize : 0) +
      (lossAt !== null && s > lossAt ? lossSize : 0) +
      (s >= 1 ? detBump : 0);
    const damped = (s: number) =>
      (gainAt !== null && Math.abs(s - gainAt) <= 3) || (lossAt !== null && Math.abs(s - lossAt) <= 3);

    const phqAt: number[] = [];
    for (let s = 0; s <= plannedLength; s++) {
      const sigma = damped(s) ? 0.5 : 1.05;
      phqAt.push(clampNum(expected(s) + step(s) + normal(rng, 0, sigma), 0, 12));
    }

    // --- Dropout mechanism tied to early non-response -----------------------
    const earlySeries = phqAt.slice(0, 5).map((value, session) => ({ session, value }));
    const earlyChange = classifyEarlyChange(earlySeries, SIM_PHQ_SCALE);
    const pDrop = sigmoid(
      -2.0 +
        1.6 * (earlyChange === "early_deterioration" ? 1 : 0) +
        0.7 * (earlyChange === "indeterminate" ? 1 : 0) +
        0.7 * (durOrd === 2 ? 1 : 0) +
        0.7 * (employment === "unemployed" ? 1 : 0) -
        0.18 * (treatmentExpectation - 5) +
        0.35 * (psychotropicMedication ? 1 : 0),
    );
    const dropout = bernoulli(rng, pDrop);
    const length = dropout ? Math.min(plannedLength, uniformInt(rng, 4, 12)) : plannedLength;
    const terminationReason: TerminationReason = dropout
      ? "dropout"
      : categorical(rng, [["completed", 0.78], ["mutual", 0.12], ["transfer", 0.06], ["other", 0.04]] as [
          TerminationReason, number,
        ][]);

    // --- Session schedule ----------------------------------------------------
    const treatmentEnd = new Date(endWindowStart + Math.floor(rng() * endWindowDays) * DAY);
    // Build dates backwards from the end: weekly ± 2 days, occasional gaps.
    const dates: Date[] = new Array(length + 1);
    let t = treatmentEnd.getTime();
    for (let s = length; s >= 0; s--) {
      dates[s] = new Date(t);
      let gap = 7 + uniformInt(rng, -2, 2);
      if (bernoulli(rng, 0.1)) gap += uniformInt(rng, 7, 14); // holiday / illness gap
      t -= gap * DAY;
    }
    const treatmentStart = dates[0];

    const sessions: SimSession[] = [];
    for (let s = 0; s <= length; s++) {
      // 5% of held sessions after baseline go unmeasured (SessionLog "held").
      const unmeasured = s > 0 && bernoulli(rng, 0.05);
      sessions.push({
        index: s,
        date: dates[s],
        phqTarget: unmeasured ? null : phqAt[s],
        pstbTarget: unmeasured ? null : clampNum(3 - phqAt[s] / 2 + normal(rng, 0, 0.35), -3, 3),
      });
    }

    // Cancellations / no-shows between sessions (~8% of transitions).
    const extraLogs: SimExtraLog[] = [];
    for (let s = 1; s <= length; s++) {
      if (bernoulli(rng, 0.08)) {
        const between = new Date((dates[s - 1].getTime() + dates[s].getTime()) / 2);
        extraLogs.push({ date: between, type: bernoulli(rng, 0.6) ? "cancelled" : "no_show" });
      }
    }

    // BDI-FS waves for ~40% of depression/anxiety cases.
    let bdiWaves: SimCase["bdiWaves"] = null;
    if ((disorderCategory === "depression" || disorderCategory === "anxiety") && bernoulli(rng, 0.4) && length >= 6) {
      const mid = Math.floor(length / 2);
      bdiWaves = [
        { wave: "pre", date: dates[0], severity01: clampNum(phqAt[0] / 12 + normal(rng, 0, 0.06), 0, 1) },
        { wave: "zm", date: dates[mid], severity01: clampNum(phqAt[mid] / 12 + normal(rng, 0, 0.06), 0, 1) },
        { wave: "post", date: dates[length], severity01: clampNum(phqAt[length] / 12 + normal(rng, 0, 0.06), 0, 1) },
      ];
    }

    const firstPool = sex === "Male" ? FIRST_NAMES_M : FIRST_NAMES_F;
    cases.push({
      index: i,
      firstName: firstPool[uniformInt(rng, 0, firstPool.length - 1)],
      lastName: LAST_NAMES[uniformInt(rng, 0, LAST_NAMES.length - 1)],
      sex,
      age,
      disorderCategory,
      icd: ICD_POOLS[disorderCategory][uniformInt(rng, 0, ICD_POOLS[disorderCategory].length - 1)],
      caseCharacteristics: {
        problemDuration,
        priorPsychotherapy,
        psychotropicMedication,
        employment,
        treatmentExpectation,
      },
      therapistId: therapists[uniformInt(rng, 0, therapists.length - 1)],
      terminationReason,
      treatmentStart,
      treatmentEnd,
      sessions,
      extraLogs,
      bdiWaves,
      dropout,
      plantedGain: gainAt !== null && gainAt < length,
      plantedLoss: lossAt !== null && lossAt < length,
      earlyChange,
    });
  }
  return cases;
}
