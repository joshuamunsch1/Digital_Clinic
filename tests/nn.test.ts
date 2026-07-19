import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dynamicNeighbors,
  gowerContext,
  gowerDistance,
  nearestNeighbors,
  nnExpectedCourse,
} from "../src/lib/analytics/nearest-neighbors";
import { seriesKeyOf, type IntakeFeatures, type ReferenceCase, type ScaleParams, type SessionPoint } from "../src/lib/analytics/types";

const KEY = seriesKeyOf("phq4", "PHQ_total");
const PHQ: ScaleParams = { higherIsBetter: false, rciCutoff: 3, range: { min: 0, max: 12 } };

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

const refCase = (code: string, f: Partial<IntakeFeatures>, series: number[]): ReferenceCase => ({
  code,
  simulated: true,
  features: features(f),
  terminationReason: "completed",
  sessionCount: series.length - 1,
  treatmentEndAt: null,
  attendance: null,
  series: { [KEY]: series.map((value, session) => ({ session, value })) },
});

describe("gowerDistance", () => {
  it("hand-computed mixed-type distance with missing-feature skipping", () => {
    // Reference ages 20..40 → range 20. Compared features: age (|30−20|/20 = .5),
    // sex (match → 0), priorPsychotherapy (mismatch → 1). Employment missing on
    // one side → skipped. Mean = 1.5 / 3 = 0.5.
    const a = features({ age: 30, sex: "Female", priorPsychotherapy: true, employment: "employed" });
    const b = features({ age: 20, sex: "Female", priorPsychotherapy: false });
    const ctx = gowerContext([a, b, features({ age: 40 })]);
    assert.equal(gowerDistance(a, b, ctx), 0.5);
  });

  it("null when nothing is comparable", () => {
    const ctx = gowerContext([]);
    assert.equal(gowerDistance(features({ age: 30 }), features({ sex: "Male" }), ctx), null);
  });

  it("identical cases have distance 0", () => {
    const a = features({ age: 30, sex: "Male", disorderCategory: "anxiety", problemDuration: 1 });
    const ctx = gowerContext([a, features({ age: 50 })]);
    assert.equal(gowerDistance(a, { ...a }, ctx), 0);
  });
});

describe("nearestNeighbors", () => {
  const reference = [
    refCase("A1", { age: 30, sex: "Female" }, [10, 8, 6]),
    refCase("A2", { age: 32, sex: "Female" }, [10, 9, 8]),
    refCase("A3", { age: 60, sex: "Male" }, [4, 3, 2]),
  ];

  it("orders by distance and truncates at k", () => {
    const nn = nearestNeighbors(features({ age: 31, sex: "Female" }), reference, 2);
    assert.deepEqual(nn.map((x) => x.c.code), ["A1", "A2"]);
  });
});

describe("dynamicNeighbors", () => {
  // Intake-identical cases that only differ in their early course.
  const reference = [
    refCase("B1", { age: 30 }, [10, 9, 9, 9, 9]), // non-responder course
    refCase("B2", { age: 30 }, [10, 7, 5, 4, 3]), // responder course
  ];

  it("reorders neighbors once observed early scores are added", () => {
    const target = features({ age: 30 });
    const flatCourse: SessionPoint[] = [
      { session: 0, value: 10 },
      { session: 1, value: 9 },
      { session: 2, value: 9 },
    ];
    const nn = dynamicNeighbors(target, flatCourse, reference, 2, KEY, PHQ);
    assert.equal(nn[0].c.code, "B1"); // matches the non-responder course
    const nnResponder = dynamicNeighbors(
      target,
      [
        { session: 0, value: 10 },
        { session: 1, value: 7 },
        { session: 2, value: 5 },
      ],
      reference,
      2,
      KEY,
      PHQ,
    );
    assert.equal(nnResponder[0].c.code, "B2");
  });
});

describe("nnExpectedCourse", () => {
  it("builds percentile points and a direction-aware failure boundary", () => {
    const reference = [10, 9, 8, 7, 6].map((b, i) => refCase(`C${i}`, { age: 30 + i }, [b, b - 2, b - 4]));
    const neighbors = nearestNeighbors(features({ age: 32 }), reference, 5);
    const { points, failureBoundary } = nnExpectedCourse(neighbors, KEY, PHQ);
    assert.equal(points[0].n, 5);
    assert.equal(points[0].p50, 8);
    // Severity scale → boundary is the p90 (worse tail): session 0 values
    // [6..10] → p90 = 9.6.
    assert.equal(failureBoundary[0].session, 0);
    assert.ok(Math.abs(failureBoundary[0].value - 9.6) < 1e-9);
  });
});
