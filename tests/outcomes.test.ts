import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOutcomes, classifyJacobsonTruax, type OutcomeCaseInput } from "../src/lib/analytics/outcomes";
import type { ScaleParams, SessionPoint } from "../src/lib/analytics/types";

// PHQ-4-shaped: lower is better, RCI cutoff 3, clinical cutoff 2.5.
const PHQ: ScaleParams = { higherIsBetter: false, rciCutoff: 3, range: { min: 0, max: 12 } };
const CUTOFF = 2.5;

const series = (...values: number[]): SessionPoint[] => values.map((value, session) => ({ session, value }));

const kase = (code: string, values: number[], over: Partial<OutcomeCaseInput> = {}): OutcomeCaseInput => ({
  code,
  simulated: true,
  series: series(...values),
  terminationReason: "completed",
  sessionCount: values.length - 1,
  endYear: 2025,
  ...over,
});

describe("classifyJacobsonTruax", () => {
  it("the four JT quadrants (lower-is-better)", () => {
    assert.equal(classifyJacobsonTruax(10, 2, PHQ, CUTOFF), "recovered"); // reliable + functional
    assert.equal(classifyJacobsonTruax(10, 5, PHQ, CUTOFF), "improved"); // reliable, still clinical
    assert.equal(classifyJacobsonTruax(10, 9, PHQ, CUTOFF), "unchanged"); // sub-RCI
    assert.equal(classifyJacobsonTruax(5, 10, PHQ, CUTOFF), "deteriorated"); // reliable worsening
  });

  it("reliable = STRICTLY above the RCI threshold (rci.ts convention)", () => {
    assert.equal(classifyJacobsonTruax(10, 7, PHQ, CUTOFF), "unchanged"); // |Δ| = 3 = cutoff
    assert.equal(classifyJacobsonTruax(10, 6.9, PHQ, CUTOFF), "improved");
  });

  it("cutoff null collapses recovered into improved", () => {
    assert.equal(classifyJacobsonTruax(10, 2, PHQ, null), "improved");
  });

  it("recovered requires a DYSFUNCTIONAL baseline — sub-clinical starters cannot 'recover'", () => {
    // pre = 2 is already on the functional side of the 2.5 cutoff; a reliable
    // further improvement is "improved", not "recovered" (counting it would
    // inflate the recovery rate on the outcomes dashboard).
    assert.equal(classifyJacobsonTruax(2, -2, PHQ, CUTOFF), "improved");
    // crossing from dysfunctional to functional stays "recovered"
    assert.equal(classifyJacobsonTruax(10, 2, PHQ, CUTOFF), "recovered");
  });

  it("no rci → null, never guessed", () => {
    assert.equal(classifyJacobsonTruax(10, 2, { ...PHQ, rciCutoff: null }, CUTOFF), null);
  });

  it("direction-aware for higherIsBetter scales", () => {
    const scale: ScaleParams = { higherIsBetter: true, rciCutoff: 3 };
    assert.equal(classifyJacobsonTruax(2, 10, scale, 5.5), "recovered"); // rose past cutoff
    assert.equal(classifyJacobsonTruax(2, 5.4, scale, 5.5), "improved");
    assert.equal(classifyJacobsonTruax(10, 2, scale, 5.5), "deteriorated");
  });
});

describe("buildOutcomes", () => {
  it("pre = earliest, post = latest, on unsorted input", () => {
    const c = kase("A", []);
    c.series = [
      { session: 8, value: 3 },
      { session: 0, value: 10 },
      { session: 4, value: 6 },
    ];
    const r = buildOutcomes([c], PHQ, CUTOFF);
    assert.equal(r.points[0].pre, 10);
    assert.equal(r.points[0].post, 3);
    assert.equal(r.points[0].change, -7);
  });

  it("excludes cases below minMeasurements and counts them", () => {
    const r = buildOutcomes([kase("A", [9]), kase("B", [9, 2])], PHQ, CUTOFF);
    assert.equal(r.points.length, 1);
    assert.equal(r.excluded, 1);
  });

  it("category counts and classifiable", () => {
    const r = buildOutcomes(
      [kase("A", [10, 2]), kase("B", [10, 5]), kase("C", [10, 9]), kase("D", [5, 10])],
      PHQ,
      CUTOFF,
    );
    assert.deepEqual(r.summary.categories, { recovered: 1, improved: 1, unchanged: 1, deteriorated: 1 });
    assert.equal(r.summary.classifiable, 4);
    const noRci = buildOutcomes([kase("A", [10, 2])], { ...PHQ, rciCutoff: null }, CUTOFF);
    assert.equal(noRci.summary.classifiable, 0);
    assert.equal(noRci.points[0].category, null);
  });

  it("effect size: baseline-SD standardized, positive = improvement", () => {
    // pres 10, 6 (mean 8, sd √8); posts 4, 2 (mean 3) → d = (8−3)/2.828 ≈ 1.77
    const r = buildOutcomes([kase("A", [10, 4]), kase("B", [6, 2])], PHQ, CUTOFF);
    assert.ok(r.summary.effectSize);
    assert.ok(Math.abs(r.summary.effectSize!.d - 5 / Math.sqrt(8)) < 1e-9);
  });

  it("effect size sign flips for higherIsBetter scales", () => {
    const scale: ScaleParams = { higherIsBetter: true, rciCutoff: 3 };
    // Rising scores on a higher-better scale = improvement → positive d.
    const r = buildOutcomes([kase("A", [2, 8]), kase("B", [4, 9])], scale, null);
    assert.ok(r.summary.effectSize!.d > 0);
  });

  it("effect size null gates: n < 2 or zero baseline spread", () => {
    assert.equal(buildOutcomes([kase("A", [10, 2])], PHQ, CUTOFF).summary.effectSize, null);
    assert.equal(
      buildOutcomes([kase("A", [10, 2]), kase("B", [10, 4])], PHQ, CUTOFF).summary.effectSize,
      null,
    );
  });

  it("termination mix grouped by year, null years omitted", () => {
    const r = buildOutcomes(
      [
        kase("A", [10, 2], { endYear: 2024, terminationReason: "completed" }),
        kase("B", [10, 8], { endYear: 2024, terminationReason: "dropout" }),
        kase("C", [10, 5], { endYear: 2025 }),
        kase("D", [10, 5], { endYear: null }),
      ],
      PHQ,
      CUTOFF,
    );
    assert.deepEqual(r.summary.terminationByYear, [
      { year: 2024, counts: { completed: 1, dropout: 1 } },
      { year: 2025, counts: { completed: 1 } },
    ]);
  });

  it("dose–response pairs skip null session counts", () => {
    const r = buildOutcomes(
      [kase("A", [10, 2], { sessionCount: 12 }), kase("B", [10, 5], { sessionCount: null })],
      PHQ,
      CUTOFF,
    );
    assert.deepEqual(r.summary.doseResponse, [{ sessions: 12, change: -8 }]);
  });
});
