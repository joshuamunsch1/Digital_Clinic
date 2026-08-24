import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildExpectedCourse,
  classifyOnTrack,
  stratifiedExpectedCourse,
} from "../src/lib/analytics/expected-course";
import type { ScaleParams, SessionPoint } from "../src/lib/analytics/types";

const flat = (values: number[]): SessionPoint[] => values.map((value, session) => ({ session, value }));

const PHQ: ScaleParams = { higherIsBetter: false, rciCutoff: 3, range: { min: 0, max: 12 } };

describe("buildExpectedCourse", () => {
  it("computes hand-verified per-occasion percentiles with n", () => {
    // Session 0 values across 5 cases: [10, 8, 6, 4, 2].
    const reference = [10, 8, 6, 4, 2].map((b) => flat([b, b - 1]));
    const [s0, s1] = buildExpectedCourse(reference);
    assert.deepEqual(
      { session: s0.session, n: s0.n, p25: s0.p25, p50: s0.p50, p75: s0.p75 },
      { session: 0, n: 5, p25: 4, p50: 6, p75: 8 },
    );
    assert.equal(s1.p50, 5);
  });

  it("hides occasions with fewer than minN cases", () => {
    // Only 2 of 5 series reach session 2.
    const reference = [flat([9, 8, 7]), flat([7, 6, 5]), flat([5, 4]), flat([3, 2]), flat([1, 0])];
    const course = buildExpectedCourse(reference, { minN: 3 });
    assert.deepEqual(course.map((p) => p.session), [0, 1]);
  });
});

describe("stratifiedExpectedCourse", () => {
  // 30 cases: 10 low (baseline 2), 10 mid (6), 10 high (10).
  const reference = [
    ...Array.from({ length: 10 }, () => ({ baseline: 2, series: flat([2, 1]) })),
    ...Array.from({ length: 10 }, () => ({ baseline: 6, series: flat([6, 5]) })),
    ...Array.from({ length: 10 }, () => ({ baseline: 10, series: flat([10, 9]) })),
  ];

  it("assigns the patient's severity tertile and builds the band from it", () => {
    const r = stratifiedExpectedCourse(reference, 10);
    assert.equal(r.stratified, true);
    assert.equal(r.stratum, 2);
    assert.equal(r.cases, 10);
    assert.equal(r.points[0].p50, 10); // high-severity stratum only
  });

  it("falls back to the pooled band below the cohort gate", () => {
    const r = stratifiedExpectedCourse(reference.slice(0, 20), 10, { minCohort: 30 });
    assert.equal(r.stratified, false);
    assert.equal(r.cases, 20);
  });

  it("falls back when the patient baseline is unknown", () => {
    assert.equal(stratifiedExpectedCourse(reference, null).stratified, false);
  });
});

describe("classifyOnTrack", () => {
  const course = buildExpectedCourse([10, 8, 6, 4, 2].map((b) => flat([b, b - 1, b - 2, b - 3])));

  it("on track inside the band", () => {
    const r = classifyOnTrack(flat([6, 5, 4, 3]), course, PHQ);
    assert.equal(r.status, "on_track");
  });

  it("not on track after 2 consecutive occasions beyond the 80% boundary (severity above p90)", () => {
    // p90 at sessions 0..3 is [9.2, 8.2, 7.2, 6.2] → 11/11 cross at sessions 1, 2.
    const r = classifyOnTrack(flat([8, 11, 11]), course, PHQ);
    assert.equal(r.status, "not_on_track");
    assert.ok(r.reasons.includes("below_band"));
  });

  it("one bad occasion alone does not trigger the band flag", () => {
    const r = classifyOnTrack(flat([6, 11, 4]), course, PHQ);
    assert.equal(r.status, "on_track");
  });

  it("a PAST streak no longer pins the flag once the patient is back inside the band", () => {
    // Sessions 1–2 beyond the boundary, sessions 3–4 recovered: current
    // status is on track (the old classifier latched the historical streak
    // and showed the amber banner forever). The course spans sessions 0–3,
    // so the trailing banded occasions are 11→outside, 2→inside.
    const r = classifyOnTrack(flat([8, 11, 11, 2]), course, PHQ);
    assert.equal(r.status, "on_track");
  });

  it("an ONGOING streak ending at the latest occasion still flags", () => {
    const r = classifyOnTrack(flat([6, 5, 11, 11]), course, PHQ);
    assert.equal(r.status, "not_on_track");
    assert.ok(r.reasons.includes("below_band"));
  });

  it("not on track on baseline-anchored RCI deterioration", () => {
    // 4 → 8 is +4 ≥ cutoff 3, even while staying inside the band at each point.
    const r = classifyOnTrack(flat([4, 5, 6, 8]), course, PHQ);
    assert.equal(r.status, "not_on_track");
    assert.ok(r.reasons.includes("rci_deterioration"));
  });

  it("direction-aware for higherIsBetter scales (worse side = below p10)", () => {
    const pstb: ScaleParams = { higherIsBetter: true, rciCutoff: null, range: { min: -3, max: 3 } };
    const ref = [1, 1.5, 2, 2.5, 3].map((b) => flat([b, b, b]));
    const c = buildExpectedCourse(ref);
    const r = classifyOnTrack(flat([0, 0, 0]), c, pstb);
    assert.equal(r.status, "not_on_track");
    assert.deepEqual(r.reasons, ["below_band"]);
  });

  it("unknown when neither band nor RCI is computable", () => {
    const r = classifyOnTrack(flat([5]), [], { ...PHQ, rciCutoff: null });
    assert.equal(r.status, "unknown");
  });
});
