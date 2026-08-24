// Scoring-engine + catalog psychometrics regression tests (2026-08-24 fixes):
// BDI-FS proration & corrected norm bands, official SDQ subscale proration,
// FGG total-mean completeness gate, and submission validation.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadInstrumentDefs } from "../src/lib/instruments/catalog";
import { computeScaleScores } from "../src/lib/instruments/scoring";
import { validateRawAnswers } from "../src/lib/instruments/validate";
import type { InstrumentDef } from "../src/lib/instruments/types";

const defs = loadInstrumentDefs();
const byId = new Map(defs.map((d) => [d.id, d]));
const get = (id: string): InstrumentDef => {
  const d = byId.get(id);
  assert.ok(d, `instrument ${id} missing from catalog`);
  return d!;
};

describe("BDI-FS scoring", () => {
  const bdi = get("bdi_fs");
  const full = {
    BDI1_Traurigkeit: 2, BDI2_Pessimismus: 1, BDI3_Versagen: 2, BDI4_Freudeverlust: 1,
    BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 2, BDI7_Suizid: 0,
  };

  it("complete answers sum normally", () => {
    const r = computeScaleScores(bdi.items, bdi.scales, full);
    assert.equal(r.scores.BDI_FS_total, 9);
  });

  it("one missing item is PRORATED (sum/6*7 rounded), not silently under-scored", () => {
    const { BDI7_Suizid: _omit, ...missing1 } = full;
    const r = computeScaleScores(bdi.items, bdi.scales, missing1);
    // sum of remaining 6 = 9 → 9/6*7 = 10.5 → round → 11 (a plain sum would report 9)
    assert.equal(r.scores.BDI_FS_total, 11);
  });

  it("two missing items exceed the tolerance → not computed", () => {
    const { BDI6_Selbstkritik: _a, BDI7_Suizid: _b, ...missing2 } = full;
    const r = computeScaleScores(bdi.items, bdi.scales, missing2);
    assert.equal(r.scores.BDI_FS_total, undefined);
    assert.ok(r.skipped.some((s) => s.key === "BDI_FS_total"));
  });

  it("norm bands follow the published BDI-FS cut-offs (0-3/4-8/9-12/13-21)", () => {
    const total = bdi.scales.find((s) => s.key === "BDI_FS_total")!;
    const bandOf = (v: number) => total.normBands!.find((b) => v >= b.min && v <= b.max)?.label;
    assert.equal(bandOf(3), "minimal");
    assert.equal(bandOf(7), "mild"); // previously mislabelled "moderat"
    assert.equal(bandOf(10), "moderat"); // previously mislabelled "schwer"
    assert.equal(bandOf(13), "schwer");
  });
});

describe("SDQ scoring (official completeness rule)", () => {
  const sdq = get("sdq_self_11_17");
  // EmoProbl items: SDQ3, SDQ8, SDQ13, SDQ16, SDQ24 (none reverse-scored)
  it("subscale with >= 3 of 5 answered is prorated as mean x 5, rounded", () => {
    const r = computeScaleScores(sdq.items, sdq.scales, { SDQ3: 2, SDQ8: 1, SDQ13: 2 });
    // mean 5/3 → ×5 = 8.33 → round → 8 (the old plain sum returned nothing)
    assert.equal(r.scores.EmoProbl, 8);
  });

  it("subscale with only 2 of 5 answered is not scored", () => {
    const r = computeScaleScores(sdq.items, sdq.scales, { SDQ3: 2, SDQ8: 1 });
    assert.equal(r.scores.EmoProbl, undefined);
  });

  it("total difficulties still requires all four problem subscales", () => {
    // Emotional answered fully, the rest untouched → GesProbl stays unscored.
    const r = computeScaleScores(sdq.items, sdq.scales, { SDQ3: 1, SDQ8: 1, SDQ13: 1, SDQ16: 1, SDQ24: 1 });
    assert.equal(r.scores.EmoProbl, 5);
    assert.equal(r.scores.GesProbl, undefined);
  });
});

describe("FGG total mean completeness gate", () => {
  const fgg = get("fgg");
  it("a single answered item no longer yields a 37-item 'Gesamtmittelwert'", () => {
    const r = computeScaleScores(fgg.items, fgg.scales, { GG1: 5 });
    assert.equal(r.scores.GG_Mean, undefined);
  });
  it("30 of 37 answered (7 missing = tolerance) still computes", () => {
    const answers = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`GG${i + 1}`, 3]));
    const r = computeScaleScores(fgg.items, fgg.scales, answers);
    assert.equal(r.scores.GG_Mean, 3);
  });
});

describe("validateRawAnswers", () => {
  const phq = get("phq4");
  it("accepts a legal submission", () => {
    assert.equal(validateRawAnswers(phq, { PHQ1: 0, PHQ2: 3, PHQ3: 1 }).ok, true);
  });
  it("rejects out-of-range and unknown items with per-item problems", () => {
    const r = validateRawAnswers(phq, { PHQ1: 99, HACK: 1, PHQ2: -1 });
    assert.equal(r.ok, false);
    assert.equal(r.problems.length, 3);
    assert.ok(r.problems.some((p) => p.startsWith("PHQ1")));
    assert.ok(r.problems.some((p) => p.startsWith("HACK")));
  });
  it("rejects non-numeric likert values, tolerates missing", () => {
    assert.equal(validateRawAnswers(phq, { PHQ1: "often" }).ok, false);
    assert.equal(validateRawAnswers(phq, { PHQ1: null, PHQ2: "" }).ok, true);
  });
  it("validates categorical answers against the defined options", () => {
    const psc = get("psc_short_self");
    assert.equal(validateRawAnswers(psc, { PSC1_Traurigkeit: "manchmal" }).ok, true);
    assert.equal(validateRawAnswers(psc, { PSC1_Traurigkeit: "immer" }).ok, false);
  });
});
