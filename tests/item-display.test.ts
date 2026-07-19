import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { itemDirection, itemValue01, recodeForDisplay } from "../src/lib/instruments/item-display";
import type { InstrumentDef, ItemDef, ScaleDef } from "../src/lib/instruments/types";

const item = (over: Partial<ItemDef> & { id: string }): ItemDef => ({
  label: over.id,
  responseType: "likert",
  ...over,
});

const scale = (key: string, items: string[], higherIsBetter: boolean, sortOrder: number): ScaleDef => ({
  key,
  label: key,
  formula: { type: "sum", items },
  higherIsBetter,
  sortOrder,
});

const instrument = (items: ItemDef[], scales: ScaleDef[]): InstrumentDef => ({
  id: "test",
  name: "Test",
  abbreviation: "T",
  population: "adult",
  raterRole: "self",
  instrumentType: "likert_battery",
  cadenceType: "every_session",
  cadenceConfig: {},
  definitionStatus: "complete",
  items,
  scales,
  sourceNotes: "",
});

// PSTB-shaped: −3..+3, I8 reverse-scored, all scales higherIsBetter.
const pstbLike = instrument(
  [item({ id: "I7", min: -3, max: 3 }), item({ id: "I8", min: -3, max: 3, reverseScored: true })],
  [scale("Beziehung", ["I7", "I8"], true, 0)],
);

// PHQ-shaped: 0..3, lower is better.
const phqLike = instrument(
  [item({ id: "P1", min: 0, max: 3 })],
  [scale("PHQ_total", ["P1"], false, 0)],
);

// SDQ-shaped: one prosocial (higher better) and one problem scale (lower).
const sdqLike = instrument(
  [item({ id: "PRO1", min: 0, max: 2 }), item({ id: "EMO1", min: 0, max: 2 })],
  [scale("Emot", ["EMO1"], false, 0), scale("Prosoz", ["PRO1"], true, 5)],
);

describe("recodeForDisplay", () => {
  it("applies the schema's reverse mapping (lo + hi − v)", () => {
    assert.equal(recodeForDisplay(pstbLike.items[1], -2), 2);
    assert.equal(recodeForDisplay(pstbLike.items[1], 3), -3);
  });

  it("passes non-reversed values through, coercing strings", () => {
    assert.equal(recodeForDisplay(pstbLike.items[0], -2), -2);
    assert.equal(recodeForDisplay(pstbLike.items[0], "1"), 1);
  });

  it("maps categorical answers through valueMap", () => {
    const psc = item({ id: "C1", responseType: "categorical", valueMap: { nie: 0, manchmal: 1, oft: 2 } });
    assert.equal(recodeForDisplay(psc, "oft"), 2);
  });

  it("missing / unparseable → null", () => {
    assert.equal(recodeForDisplay(pstbLike.items[0], null), null);
    assert.equal(recodeForDisplay(pstbLike.items[0], ""), null);
    assert.equal(recodeForDisplay(pstbLike.items[0], "abc"), null);
  });
});

describe("itemDirection", () => {
  it("uses the owning scale's higherIsBetter (mixed-direction SDQ)", () => {
    assert.equal(itemDirection(sdqLike, "PRO1"), true);
    assert.equal(itemDirection(sdqLike, "EMO1"), false);
  });

  it("falls back to the first scale for unassigned items", () => {
    assert.equal(itemDirection(sdqLike, "UNKNOWN"), false); // Emot has sortOrder 0
  });
});

describe("itemValue01", () => {
  it("PSTB reverse round-trip: raw −2 on a reversed item → favorable ≈ .83", () => {
    // recoded +2 on −3..+3 → (2+3)/6 = 5/6, direction higherIsBetter.
    const v = itemValue01(pstbLike, pstbLike.items[1], -2);
    assert.ok(v !== null && Math.abs(v - 5 / 6) < 1e-9, `${v}`);
  });

  it("flips for lower-is-better instruments (max symptom answer → 0)", () => {
    assert.equal(itemValue01(phqLike, phqLike.items[0], 3), 0);
    assert.equal(itemValue01(phqLike, phqLike.items[0], 0), 1);
  });

  it("null without a usable numeric range (categorical valueMap-only item)", () => {
    const psc = item({ id: "C1", responseType: "categorical", valueMap: { nie: 0, oft: 2 } });
    const inst = instrument([psc], [scale("Gesamt", ["C1"], false, 0)]);
    assert.equal(itemValue01(inst, psc, "oft"), null);
  });

  it("null for missing answers", () => {
    assert.equal(itemValue01(pstbLike, pstbLike.items[0], undefined), null);
  });

  it("clamps out-of-range raw values into [0, 1]", () => {
    assert.equal(itemValue01(phqLike, phqLike.items[0], 7), 0);
  });
});
