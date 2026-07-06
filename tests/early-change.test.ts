import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyEarlyChange } from "../src/lib/analytics/early-change";
import type { ScaleParams, SessionPoint } from "../src/lib/analytics/types";

const series = (values: [number, number][]): SessionPoint[] =>
  values.map(([session, value]) => ({ session, value }));

const PHQ: ScaleParams = { higherIsBetter: false, rciCutoff: 3, range: { min: 0, max: 12 } };

describe("classifyEarlyChange", () => {
  it("early response: reliable improvement by session ≤ 4", () => {
    assert.equal(classifyEarlyChange(series([[0, 10], [2, 8], [4, 5]]), PHQ), "early_response");
  });

  it("early deterioration: reliable worsening", () => {
    assert.equal(classifyEarlyChange(series([[0, 5], [3, 9]]), PHQ), "early_deterioration");
  });

  it("indeterminate: sub-threshold change", () => {
    assert.equal(classifyEarlyChange(series([[0, 10], [4, 9]]), PHQ), "indeterminate");
  });

  it("uses the LATEST session ≤ 4, not the first", () => {
    // Session 1 would be a response; session 4 (the comparison point) is not.
    assert.equal(classifyEarlyChange(series([[0, 10], [1, 5], [4, 9]]), PHQ), "indeterminate");
  });

  it("ignores sessions after maxSession", () => {
    assert.equal(classifyEarlyChange(series([[0, 10], [7, 2]]), PHQ), null);
  });

  it("direction-aware for higherIsBetter scales", () => {
    const pstb: ScaleParams = { higherIsBetter: true, rciCutoff: 1.5, range: { min: -3, max: 3 } };
    assert.equal(classifyEarlyChange(series([[0, -2], [3, 0]]), pstb), "early_response");
    assert.equal(classifyEarlyChange(series([[0, 1], [3, -1]]), pstb), "early_deterioration");
  });

  it("null when unclassifiable: no baseline, no early point, or no rci", () => {
    assert.equal(classifyEarlyChange([], PHQ), null);
    assert.equal(classifyEarlyChange(series([[0, 10]]), PHQ), null);
    assert.equal(
      classifyEarlyChange(series([[0, 10], [2, 5]]), { ...PHQ, rciCutoff: null }),
      null,
    );
  });
});
