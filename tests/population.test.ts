// Age-band population matching (src/lib/instruments/population.ts) — the
// textual check it replaced offered a 5-year-old the SDQ 11–17 and a 9-year-old
// the adult_adolescent PHQ-4.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageMatchesPopulation } from "../src/lib/instruments/population";

describe("ageMatchesPopulation", () => {
  it("explicit numeric ranges are enforced", () => {
    assert.equal(ageMatchesPopulation("adolescent_11_17", 5), false); // old check: true
    assert.equal(ageMatchesPopulation("adolescent_11_17", 14), true);
    assert.equal(ageMatchesPopulation("child_adolescent_8_16", 7), false);
    assert.equal(ageMatchesPopulation("child_adolescent_8_16", 8), true);
    assert.equal(ageMatchesPopulation("child_2_4", 16), false); // old check: true
    assert.equal(ageMatchesPopulation("child_2_4", 3), true);
    assert.equal(ageMatchesPopulation("child_adolescent_4_17", 17), true);
    assert.equal(ageMatchesPopulation("child_adolescent_4_17", 18), false);
  });

  it("stage bands: adult >= 18, adolescent 11-17, child <= 12", () => {
    assert.equal(ageMatchesPopulation("adult", 17), false);
    assert.equal(ageMatchesPopulation("adult", 18), true);
    assert.equal(ageMatchesPopulation("adult_adolescent", 9), false); // old check: true (PHQ-4 for a 9-year-old)
    assert.equal(ageMatchesPopulation("adult_adolescent", 12), true);
    assert.equal(ageMatchesPopulation("child_adolescent", 5), true);
    assert.equal(ageMatchesPopulation("child_adolescent", 30), false);
    assert.equal(ageMatchesPopulation("child_school_age", 5), false);
    assert.equal(ageMatchesPopulation("child_school_age", 9), true);
  });

  it("border ages deliberately overlap child and adolescent stages", () => {
    assert.equal(ageMatchesPopulation("child", 11), true);
    assert.equal(ageMatchesPopulation("adolescent", 11), true);
  });

  it("'all' matches every age", () => {
    assert.equal(ageMatchesPopulation("all", 4), true);
    assert.equal(ageMatchesPopulation("all", 80), true);
  });
});
