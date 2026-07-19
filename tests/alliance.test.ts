import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  consecutiveDeltas,
  detectAllianceRuptures,
  empiricalRuptureThreshold,
} from "../src/lib/analytics/alliance";
import type { ScaleParams, SessionPoint } from "../src/lib/analytics/types";

const series = (...values: number[]): SessionPoint[] => values.map((value, session) => ({ session, value }));

// PSTB-like alliance scale: higher = better, no rci (the real situation).
const PSTB_ALLIANCE: ScaleParams = { higherIsBetter: true, rciCutoff: null, range: { min: -3, max: 3 } };

/// Reference deltas centred on mild improvement with a worsening tail; for a
/// higherIsBetter scale a WORSENING is a negative delta. 40 deltas, worsening
/// orientation sorted: 30 negatives, then .2 .3 .4 .5 .6 .8 .9 1.0 1.2 1.5 —
/// R type-7 p95: h = 39 · 0.95 = 37.05 → 1.0 + 0.05 · (1.2 − 1.0) = 1.01.
const REF_DELTAS = [
  ...Array.from({ length: 30 }, (_, i) => 0.1 + (i % 5) * 0.1), // improvements
  -0.2, -0.3, -0.4, -0.5, -0.6, -0.8, -0.9, -1.0, -1.2, -1.5, // worsenings
];
const REF_P95 = 1.01;

describe("consecutiveDeltas", () => {
  it("pairs strictly consecutive sessions and signs to − from", () => {
    const d = consecutiveDeltas(series(1.0, 1.5, 0.5));
    assert.deepEqual(d, [
      { from: 0, to: 1, delta: 0.5 },
      { from: 1, to: 2, delta: -1.0 },
    ]);
  });

  it("skips transitions across session gaps", () => {
    const d = consecutiveDeltas([
      { session: 0, value: 1 },
      { session: 1, value: 2 },
      { session: 3, value: 0 }, // S1→S3 gap: no delta
    ]);
    assert.deepEqual(d, [{ from: 0, to: 1, delta: 1 }]);
  });

  it("sorts unsorted input deterministically", () => {
    const shuffled: SessionPoint[] = [
      { session: 2, value: 3 },
      { session: 0, value: 1 },
      { session: 1, value: 2 },
    ];
    assert.deepEqual(consecutiveDeltas(shuffled), [
      { from: 0, to: 1, delta: 1 },
      { from: 1, to: 2, delta: 1 },
    ]);
  });

  it("fewer than 2 points → no deltas", () => {
    assert.deepEqual(consecutiveDeltas(series(1)), []);
    assert.deepEqual(consecutiveDeltas([]), []);
  });
});

describe("empiricalRuptureThreshold", () => {
  it("takes the worsening-tail percentile (p95 of worsening orientation)", () => {
    // Worsening orientation for higherIsBetter: flip sign.
    const t = empiricalRuptureThreshold(REF_DELTAS.map((d) => -d));
    assert.ok(t !== null && Math.abs(t - REF_P95) < 1e-9, `threshold ${t}`);
  });

  it("gates on minN (default 30)", () => {
    assert.equal(empiricalRuptureThreshold([1, 2, 3]), null);
    assert.ok(empiricalRuptureThreshold(Array.from({ length: 30 }, (_, i) => i * 0.1)) !== null);
  });

  it("returns null when the tail is not an actual worsening", () => {
    // Everything improves — no calibratable rupture cutoff.
    const t = empiricalRuptureThreshold(Array.from({ length: 40 }, () => -0.5));
    assert.equal(t, null);
  });
});

describe("detectAllianceRuptures", () => {
  it("empirical criterion flags drops beyond the reference tail (higherIsBetter)", () => {
    // Drop of 1.8 from S3→S4 exceeds the 1.01 empirical threshold.
    const s = series(1.2, 1.4, 1.5, 1.6, -0.2, 1.3);
    const r = detectAllianceRuptures(s, PSTB_ALLIANCE, REF_DELTAS);
    assert.equal(r.criterion, "empirical");
    assert.ok(r.threshold !== null && Math.abs(r.threshold - REF_P95) < 1e-9);
    assert.equal(r.referenceN, REF_DELTAS.length);
    assert.equal(r.ruptures.length, 1);
    assert.equal(r.ruptures[0].fromSession, 3);
    assert.equal(r.ruptures[0].toSession, 4);
    assert.ok(Math.abs(r.ruptures[0].delta - -1.8) < 1e-9);
    assert.equal(r.latestIsRupture, false); // S4→S5 recovers
  });

  it("latestIsRupture fires when the newest transition is the drop", () => {
    const r = detectAllianceRuptures(series(1.2, 1.4, -0.2), PSTB_ALLIANCE, REF_DELTAS);
    assert.equal(r.latestIsRupture, true);
  });

  it("RCI criterion takes precedence and needs no reference deltas", () => {
    const scale: ScaleParams = { ...PSTB_ALLIANCE, rciCutoff: 1.2 };
    const r = detectAllianceRuptures(series(1.0, -0.5), scale, []);
    assert.equal(r.criterion, "rci");
    assert.equal(r.threshold, 1.2);
    assert.equal(r.referenceN, null);
    assert.equal(r.ruptures.length, 1);
  });

  it("direction-aware for lower-is-better scales (rise = worsening)", () => {
    const scale: ScaleParams = { higherIsBetter: false, rciCutoff: 2 };
    const r = detectAllianceRuptures(series(3, 6, 5), scale, []);
    assert.equal(r.ruptures.length, 1);
    assert.equal(r.ruptures[0].toSession, 1);
    assert.equal(r.ruptures[0].delta, 3);
  });

  it("no rci and insufficient reference → criterion null, silence", () => {
    const r = detectAllianceRuptures(series(1.5, -2.0), PSTB_ALLIANCE, [-0.5, -0.6]);
    assert.equal(r.criterion, null);
    assert.equal(r.threshold, null);
    assert.deepEqual(r.ruptures, []);
    assert.equal(r.latestIsRupture, false);
  });

  it("fewer than 2 points → empty result even with a valid criterion", () => {
    const r = detectAllianceRuptures(series(1.5), PSTB_ALLIANCE, REF_DELTAS);
    assert.equal(r.criterion, "empirical");
    assert.deepEqual(r.ruptures, []);
    assert.equal(r.latestIsRupture, false);
  });

  it("gap transitions never rupture (no S5→S7 deltas)", () => {
    const s: SessionPoint[] = [
      { session: 4, value: 1.5 },
      { session: 6, value: -1.5 }, // huge drop, but across a gap
    ];
    const r = detectAllianceRuptures(s, PSTB_ALLIANCE, REF_DELTAS);
    assert.deepEqual(r.ruptures, []);
  });
});
