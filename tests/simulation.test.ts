// Cohort-level sanity checks: the generative model must produce data whose
// planted signal the analytics actually recover — otherwise the Stage-2/3
// demos would be showing noise.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attendanceFeatures, type AttendanceLogInput } from "../src/lib/analytics/attendance";
import { predictDropoutRisk, trainDropoutModel } from "../src/lib/analytics/dropout-risk";
import { predictEtr, trainEtr } from "../src/lib/analytics/etr";
import { detectSuddenShifts } from "../src/lib/analytics/sudden-shifts";
import type { IntakeFeatures, ReferenceCase, SessionPoint } from "../src/lib/analytics/types";
import { generateCohort, SIM_PHQ_SCALE, type SimCase } from "../src/lib/simulation/cohort";

const KEY = "phq4|PHQ_total";
const DURATION_ORD = { lt6m: 0, m6to24: 1, gt24m: 2 } as const;

function phqSeries(c: SimCase): SessionPoint[] {
  return c.sessions
    .filter((s) => s.phqTarget !== null)
    .map((s) => ({ session: s.index, value: s.phqTarget! }));
}

/// Mirror of how seed-simulation.ts writes the ledger: held rows only for
/// unmeasured sessions (no sessionNumber), plus the cancelled/no-show extras.
function simLogs(c: SimCase): AttendanceLogInput[] {
  const logs: AttendanceLogInput[] = c.sessions
    .filter((s) => s.phqTarget === null)
    .map((s) => ({ type: "held", occurredAt: s.date, sessionNumber: null }));
  for (const l of c.extraLogs) logs.push({ type: l.type, occurredAt: l.date, sessionNumber: null });
  return logs;
}

function toReferenceCase(c: SimCase): ReferenceCase {
  const series = phqSeries(c);
  return {
    code: `SIM${c.index}`,
    simulated: true,
    features: {
      age: c.age,
      sex: c.sex,
      disorderCategory: c.disorderCategory,
      baselineSeverity: series[0]?.value ?? null,
      problemDuration: DURATION_ORD[c.caseCharacteristics.problemDuration],
      priorPsychotherapy: c.caseCharacteristics.priorPsychotherapy,
      psychotropicMedication: c.caseCharacteristics.psychotropicMedication,
      employment: c.caseCharacteristics.employment,
      treatmentExpectation: c.caseCharacteristics.treatmentExpectation,
    },
    terminationReason: c.terminationReason,
    sessionCount: series.length ? series[series.length - 1].session : null,
    treatmentEndAt: c.treatmentEnd.toISOString(),
    attendance: attendanceFeatures(simLogs(c), series.map((p) => p.session)),
    series: { [KEY]: series },
  };
}

const features = (over: Partial<IntakeFeatures>): IntakeFeatures => ({
  age: 35,
  sex: "Female",
  disorderCategory: "depression",
  baselineSeverity: 8,
  problemDuration: 1,
  priorPsychotherapy: false,
  psychotropicMedication: false,
  employment: "employed",
  treatmentExpectation: 6,
  ...over,
});

describe("simulated cohort", () => {
  // Same size as the production default (SIM_COHORT_SIZE) — the checks should
  // hold at the scale the app actually runs at.
  const cohort = generateCohort(250);
  const cases = cohort.map(toReferenceCase);

  it("dropout rate lands in a plausible outpatient range", () => {
    const rate = cohort.filter((c) => c.dropout).length / cohort.length;
    assert.ok(rate >= 0.1 && rate <= 0.35, `dropout rate ${rate}`);
  });

  it("early deterioration carries more dropout risk than early response (planted mechanism)", () => {
    const rateOf = (group: SimCase[]) =>
      group.length ? group.filter((c) => c.dropout).length / group.length : NaN;
    const det = rateOf(cohort.filter((c) => c.earlyChange === "early_deterioration"));
    const resp = rateOf(cohort.filter((c) => c.earlyChange === "early_response"));
    assert.ok(!Number.isNaN(det) && !Number.isNaN(resp), "both early-change groups populated");
    assert.ok(det > resp, `deterioration ${det} vs response ${resp}`);
  });

  it("trained dropout model ranks a planted high-risk profile above a low-risk one", () => {
    const model = trainDropoutModel(cases, KEY, SIM_PHQ_SCALE);
    assert.ok(model, "training gates pass at n=150");
    const high = predictDropoutRisk(
      model!,
      features({ problemDuration: 2, employment: "unemployed", treatmentExpectation: 2, psychotropicMedication: true, priorPsychotherapy: true, baselineSeverity: 10 }),
      "early_deterioration",
      null,
    );
    const low = predictDropoutRisk(
      model!,
      features({ problemDuration: 0, treatmentExpectation: 9, baselineSeverity: 6 }),
      "early_response",
      null,
    );
    assert.ok(high.probability > low.probability, `${high.probability} vs ${low.probability}`);
    assert.ok(model!.trainAuc > 0.55, `train AUC ${model!.trainAuc}`);
  });

  it("ETR stage B recovers the planted expectation effect on the slope", () => {
    const model = trainEtr(cases.map((c) => ({ features: c.features, series: c.series[KEY] })));
    assert.ok(model, "≥30 fittable cases");
    const high = predictEtr(model!, features({ treatmentExpectation: 10 }), [10]);
    const low = predictEtr(model!, features({ treatmentExpectation: 1 }), [10]);
    // Higher expectation → steeper improvement → lower severity at session 10.
    assert.ok(high[0].expected < low[0].expected, `${high[0].expected} vs ${low[0].expected}`);
  });

  it("reference attendance recovers the planted cancellation/no-show rate", () => {
    // Cohort plants ~8% of transitions as cancelled/no_show (60/40 split) and
    // ~5% of post-baseline sessions as held-but-unmeasured.
    let missed = 0;
    let appointments = 0;
    let unmeasuredHeld = 0;
    let held = 0;
    for (const c of cases) {
      assert.ok(c.attendance?.available, "every sim case has appointments");
      missed += c.attendance!.cancelled + c.attendance!.noShow;
      appointments += c.attendance!.appointments;
      unmeasuredHeld += Math.round((c.attendance!.unmeasuredHeldRate ?? 0) * c.attendance!.held);
      held += c.attendance!.held;
    }
    const missRate = missed / appointments;
    assert.ok(missRate > 0.04 && missRate < 0.11, `pooled miss rate ${missRate}`);
    const unmeasuredRate = unmeasuredHeld / held;
    assert.ok(unmeasuredRate > 0.02 && unmeasuredRate < 0.08, `pooled unmeasured-held rate ${unmeasuredRate}`);
  });

  it("realized sudden-gain prevalence stays in the target range", () => {
    const withGain = cohort.filter((c) => detectSuddenShifts(phqSeries(c), SIM_PHQ_SCALE).some((s) => s.kind === "gain"));
    const prevalence = withGain.length / cohort.length;
    assert.ok(prevalence >= 0.08 && prevalence <= 0.35, `sudden-gain prevalence ${prevalence}`);
  });

  it("same seed ⇒ byte-identical cohort (determinism)", () => {
    const again = generateCohort(40);
    assert.deepEqual(JSON.parse(JSON.stringify(generateCohort(40))), JSON.parse(JSON.stringify(again)));
  });
});
