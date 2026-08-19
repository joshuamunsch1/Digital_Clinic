import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inkIsEmpty, inkKey, inkToSvg, parseInk, serializeInk, strokePath, toBase64,
  type InkNote,
} from "../src/lib/ink";

const note = (strokes: InkNote["strokes"]): InkNote => ({ v: 1, w: 600, h: 200, strokes });

describe("parseInk", () => {
  it("round-trips a serialized note", () => {
    const n = note([{ x: [1, 2.5, 3], y: [4, 5, 6.5], w: 2.4 }]);
    assert.deepEqual(parseInk(serializeInk(n)), n);
  });

  it("rejects non-strings, empty strings and malformed JSON", () => {
    assert.equal(parseInk(undefined), null);
    assert.equal(parseInk(42), null);
    assert.equal(parseInk(""), null);
    assert.equal(parseInk("{not json"), null);
  });

  it("rejects wrong version, bad dimensions and missing strokes", () => {
    assert.equal(parseInk(JSON.stringify({ v: 2, w: 600, h: 200, strokes: [] })), null);
    assert.equal(parseInk(JSON.stringify({ v: 1, w: 0, h: 200, strokes: [] })), null);
    assert.equal(parseInk(JSON.stringify({ v: 1, w: 600, h: NaN, strokes: [] })), null);
    assert.equal(parseInk(JSON.stringify({ v: 1, w: 600, h: 200 })), null);
  });

  it("rejects strokes with non-finite values, length mismatch or empty points", () => {
    const bad = (strokes: unknown) => parseInk(JSON.stringify({ v: 1, w: 600, h: 200, strokes }));
    assert.equal(bad([{ x: [1], y: [1], w: Infinity }]), null);
    assert.equal(bad([{ x: [1, "2"], y: [1, 2], w: 2 }]), null);
    assert.equal(bad([{ x: [1, 2], y: [1], w: 2 }]), null);
    assert.equal(bad([{ x: [], y: [], w: 2 }]), null);
    assert.equal(bad([null]), null);
  });

  it("accepts an empty note (zero strokes) and flags it via inkIsEmpty", () => {
    const n = parseInk(JSON.stringify(note([])));
    assert.ok(n);
    assert.equal(inkIsEmpty(n!), true);
    assert.equal(inkIsEmpty(note([{ x: [1], y: [1], w: 2 }])), false);
  });
});

describe("strokePath", () => {
  it("renders a single point as a zero-length dot segment", () => {
    assert.equal(strokePath({ x: [10], y: [20], w: 2 }), "M10 20L10 20");
  });

  it("smooths multi-point strokes through quadratic midpoints", () => {
    // Midpoint of (0,0)-(10,0) is (5,0); control point is the previous point.
    assert.equal(strokePath({ x: [0, 10], y: [0, 0], w: 2 }), "M0 0Q0 0 5 0L10 0");
  });

  it("rounds coordinates to one decimal", () => {
    const d = strokePath({ x: [1.234, 5.678], y: [9.876, 3.21], w: 2 });
    assert.ok(!/\d\.\d\d/.test(d), d);
  });
});

describe("inkToSvg", () => {
  it("emits a standalone SVG with viewBox and one path per stroke", () => {
    const svg = inkToSvg(note([
      { x: [0, 10], y: [0, 5], w: 2 },
      { x: [3], y: [4], w: 3 },
    ]));
    assert.ok(svg.startsWith("<svg "));
    assert.ok(svg.includes('viewBox="0 0 600 200"'));
    assert.equal((svg.match(/<path /g) || []).length, 2);
    assert.ok(svg.includes('stroke-linecap="round"'));
  });

  it("contains only generated markup — numbers cannot smuggle tags", () => {
    const svg = inkToSvg(note([{ x: [1.5], y: [2.5], w: 1.2 }]));
    assert.equal((svg.match(/</g) || []).length, (svg.match(/>/g) || []).length);
    assert.ok(!svg.includes("script"));
  });
});

describe("toBase64 / inkKey", () => {
  it("produces base64 Node can decode back", () => {
    const svg = inkToSvg(note([{ x: [1], y: [2], w: 2 }]));
    assert.equal(Buffer.from(toBase64(svg), "base64").toString("utf8"), svg);
  });

  it("inkKey appends the sibling suffix", () => {
    assert.equal(inkKey("1.1_text"), "1.1_text_ink");
  });
});
