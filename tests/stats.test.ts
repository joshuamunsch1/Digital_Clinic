import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mean, olsFit, percentile, pooledSd, sd } from "../src/lib/analytics/stats";

describe("stats", () => {
  it("mean", () => {
    assert.equal(mean([1, 2, 3, 4]), 2.5);
  });

  it("sample sd (n−1)", () => {
    // Hand-computed: mean 5, Σ(x−m)² = 32, 32/7 = 4.5714…
    assert.ok(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9]) - Math.sqrt(32 / 7)) < 1e-12);
    assert.equal(sd([3]), 0);
  });

  it("percentile matches R type-7 quantile()", () => {
    const xs = [1, 2, 3, 4];
    assert.equal(percentile(xs, 0.25), 1.75); // R: quantile(1:4, .25) = 1.75
    assert.equal(percentile(xs, 0.5), 2.5);
    assert.equal(percentile(xs, 0.75), 3.25);
    assert.equal(percentile([7], 0.5), 7);
    assert.equal(percentile([5, 1, 3], 0.5), 3); // unsorted input
  });

  it("pooledSd matches the suddengains formula", () => {
    // pre sd = 2 (var 4, n=3), post sd = √2 (var 2, n=2):
    // √[(2·4 + 1·2) / 3] = √(10/3)
    assert.ok(Math.abs(pooledSd([10, 12, 14], [4, 6]) - Math.sqrt(10 / 3)) < 1e-12);
    assert.equal(pooledSd([5, 5, 5], [1, 1, 1]), 0);
  });

  it("olsFit recovers exact linear coefficients", () => {
    const X = [[0], [1], [2], [3]];
    const y = X.map(([x]) => 2 + 3 * x);
    const beta = olsFit(X, y)!;
    assert.ok(Math.abs(beta[0] - 2) < 1e-6);
    assert.ok(Math.abs(beta[1] - 3) < 1e-6);
  });

  it("olsFit recovers two-feature coefficients", () => {
    const rows: number[][] = [];
    const y: number[] = [];
    for (let a = 0; a < 4; a++)
      for (let b = 0; b < 3; b++) {
        rows.push([a, b]);
        y.push(1 - 2 * a + 0.5 * b);
      }
    const beta = olsFit(rows, y)!;
    assert.ok(Math.abs(beta[0] - 1) < 1e-6);
    assert.ok(Math.abs(beta[1] + 2) < 1e-6);
    assert.ok(Math.abs(beta[2] - 0.5) < 1e-6);
  });

  it("olsFit returns null for underdetermined systems", () => {
    assert.equal(olsFit([[1, 2]], [3]), null);
  });
});
