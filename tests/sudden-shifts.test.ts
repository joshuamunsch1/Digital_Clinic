import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectSuddenShifts } from "../src/lib/analytics/sudden-shifts";
import type { ScaleParams, SessionPoint } from "../src/lib/analytics/types";

const series = (values: (number | null)[]): SessionPoint[] =>
  values.flatMap((v, session) => (v === null ? [] : [{ session, value: v }]));

// PHQ-4-like severity scale: higher = worse, anchored 0–12.
const PHQ: ScaleParams = { higherIsBetter: false, rciCutoff: 3, range: { min: 0, max: 12 } };

describe("detectSuddenShifts", () => {
  it("detects the canonical gain (all three criteria)", () => {
    // 12,11,12 | drop to | 4,4,3 between sessions 2→3.
    const shifts = detectSuddenShifts(series([12, 11, 12, 4, 4, 3, 4]), PHQ);
    assert.equal(shifts.length, 1);
    const g = shifts[0];
    assert.equal(g.kind, "gain");
    assert.equal(g.fromSession, 2);
    assert.equal(g.toSession, 3);
    assert.equal(g.delta, -8); // original units, signed
    assert.equal(g.nPre, 3);
    assert.equal(g.nPost, 3);
    assert.equal(g.criticalValue, 2.776);
  });

  it("criterion 1: change below the RCI cutoff is not a gain", () => {
    assert.equal(detectSuddenShifts(series([12, 12, 12, 10, 10, 10]), PHQ).length, 0);
  });

  it("criterion 2: change below 25% of the pre-shift score is not a gain", () => {
    // Cutoff 2: drop of 2.5 passes criterion 1 but 2.5 < 0.25·12 = 3.
    const scale: ScaleParams = { ...PHQ, rciCutoff: 2 };
    assert.equal(detectSuddenShifts(series([12, 12, 12, 9.5, 9.5, 9.5]), scale).length, 0);
  });

  it("criterion 3: oscillating series fails the stability test", () => {
    assert.equal(detectSuddenShifts(series([12, 4, 12, 4, 12, 4, 12]), PHQ).length, 0);
  });

  it("uses 3.182 when one window has only 2 measurements", () => {
    // Session 0 missing → pre window for the 2→3 pair = {1, 2} (n = 2).
    const shifts = detectSuddenShifts(series([null, 11, 12, 4, 4, 3]), PHQ);
    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].nPre, 2);
    assert.equal(shifts[0].criticalValue, 3.182);
  });

  it("uses 4.303 when both windows have only 2 measurements", () => {
    const shifts = detectSuddenShifts(series([null, 11, 12, 4, 4]), PHQ);
    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].nPre, 2);
    assert.equal(shifts[0].nPost, 2);
    assert.equal(shifts[0].criticalValue, 4.303);
  });

  it("requires ≥ 2 of 3 measurements on each side (no imputation)", () => {
    // Post side has only session 3 measured → skip.
    assert.equal(detectSuddenShifts(series([12, 11, 12, 4]), PHQ).length, 0);
  });

  it("requires consecutive sessions for the shift pair", () => {
    // Drop happens across a missing session (2 → 4): no consecutive pair.
    assert.equal(detectSuddenShifts(series([12, 11, 12, null, 4, 4, 3]), PHQ).length, 0);
  });

  it("detects sudden losses as the mirror image", () => {
    const shifts = detectSuddenShifts(series([2, 3, 2, 10, 10, 11]), PHQ);
    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].kind, "loss");
    assert.equal(shifts[0].delta, 8);
  });

  it("handles higherIsBetter scales via the severity range shift (PSTB)", () => {
    // PSTB-like: −3..+3, higher better. Jump −2.5 → +1 is an improvement (gain).
    const pstb: ScaleParams = { higherIsBetter: true, rciCutoff: 1.5, range: { min: -3, max: 3 } };
    const shifts = detectSuddenShifts(series([-2.5, -2.5, -2.5, 1, 1, 1]), pstb);
    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].kind, "gain");
    assert.equal(shifts[0].delta, 3.5);
  });

  it("skips detection entirely when the scale has no rci parameters", () => {
    const noRci: ScaleParams = { higherIsBetter: false, rciCutoff: null, range: { min: 0, max: 12 } };
    assert.equal(detectSuddenShifts(series([12, 11, 12, 4, 4, 3]), noRci).length, 0);
  });
});
