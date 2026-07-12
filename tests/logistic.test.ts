import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auc, predictLogistic, trainLogistic } from "../src/lib/analytics/logistic";

describe("trainLogistic", () => {
  // Separable one-feature data: y = 1 for x > 0.
  const X = [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2].map((x) => [x]);
  const y = [0, 0, 0, 0, 1, 1, 1, 1];

  it("recovers direction and ranks correctly", () => {
    const fit = trainLogistic(X, y);
    assert.ok(fit.weights[0] > 0);
    assert.ok(predictLogistic(fit, [2]) > 0.8);
    assert.ok(predictLogistic(fit, [-2]) < 0.2);
    assert.ok(predictLogistic(fit, [2]) > predictLogistic(fit, [0.1]));
  });

  it("is deterministic across runs", () => {
    const a = trainLogistic(X, y);
    const b = trainLogistic(X, y);
    assert.deepEqual(a, b);
  });
});

describe("auc", () => {
  it("perfect ranking → 1, reversed → 0, ties → 0.5", () => {
    assert.equal(auc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0]), 1);
    assert.equal(auc([0.1, 0.2, 0.8, 0.9], [1, 1, 0, 0]), 0);
    assert.equal(auc([0.5, 0.5, 0.5, 0.5], [1, 1, 0, 0]), 0.5);
  });

  it("hand-computed mixed ranking", () => {
    // Pairs: (.7 vs .6)=1, (.7 vs .4)=1, (.3 vs .6)=0, (.3 vs .4)=0 → 2/4.
    assert.equal(auc([0.7, 0.3, 0.6, 0.4], [1, 1, 0, 0]), 0.5);
  });

  it("NaN when a class is missing", () => {
    assert.ok(Number.isNaN(auc([0.5], [1])));
  });
});
