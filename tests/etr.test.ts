import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitLogLinear, predictEtr, trainEtr } from "../src/lib/analytics/etr";
import type { IntakeFeatures, SessionPoint } from "../src/lib/analytics/types";

const logSeries = (a: number, b: number, sessions: number[]): SessionPoint[] =>
  sessions.map((s) => ({ session: s, value: a + b * Math.log(s + 1) }));

const features = (over: Partial<IntakeFeatures>): IntakeFeatures => ({
  age: null,
  sex: null,
  disorderCategory: null,
  baselineSeverity: null,
  problemDuration: null,
  priorPsychotherapy: null,
  psychotropicMedication: null,
  employment: null,
  treatmentExpectation: null,
  ...over,
});

describe("fitLogLinear", () => {
  it("recovers exact log-linear coefficients", () => {
    const fit = fitLogLinear(logSeries(9, -2, [0, 1, 2, 3, 4, 5]))!;
    assert.ok(Math.abs(fit.intercept - 9) < 1e-6);
    assert.ok(Math.abs(fit.slope + 2) < 1e-6);
  });

  it("null below 3 points or without session spread", () => {
    assert.equal(fitLogLinear(logSeries(9, -2, [0, 1])), null);
    assert.equal(
      fitLogLinear([
        { session: 2, value: 5 },
        { session: 2, value: 5 },
        { session: 2, value: 5 },
      ]),
      null,
    );
  });
});

describe("trainEtr / predictEtr", () => {
  it("stage B recovers a planted expectation→slope relationship", () => {
    // Deterministic cohort: intercept = baselineSeverity; slope steeper (more
    // negative) with higher treatment expectation: b = −1 − 0.1·expectation.
    const cases = Array.from({ length: 40 }, (_, i) => {
      const expectation = i % 11;
      const baseline = 6 + (i % 5);
      return {
        features: features({ treatmentExpectation: expectation, baselineSeverity: baseline }),
        series: logSeries(baseline, -1 - 0.1 * expectation, [0, 1, 2, 3, 4, 5, 6]),
      };
    });
    const model = trainEtr(cases)!;
    assert.ok(model, "gate: ≥30 fittable cases");
    assert.equal(model.n, 40);

    const high = predictEtr(model, features({ treatmentExpectation: 10, baselineSeverity: 8 }), [0, 6]);
    const low = predictEtr(model, features({ treatmentExpectation: 0, baselineSeverity: 8 }), [0, 6]);
    // Same baseline → similar start; high expectation → lower (better) value at session 6.
    assert.ok(Math.abs(high[0].expected - low[0].expected) < 0.5);
    assert.ok(high[1].expected < low[1].expected - 0.5);
  });

  it("null below the case gate", () => {
    const cases = Array.from({ length: 10 }, () => ({
      features: features({}),
      series: logSeries(8, -1.5, [0, 1, 2, 3]),
    }));
    assert.equal(trainEtr(cases), null);
  });
});
