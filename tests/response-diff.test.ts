import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertItemIds, itemRows, previousResponse } from "../src/lib/instruments/response-diff";
import { rawDataCsv, rawDataFileName } from "../src/lib/raw-export";
import type { InstrumentDef, ItemDef, ScaleDef } from "../src/lib/instruments/types";
import type { ResponseRecord } from "../src/lib/types";

const item = (over: Partial<ItemDef> & { id: string }): ItemDef => ({ label: over.id, responseType: "likert", ...over });

const bdiLike: InstrumentDef = {
  id: "bdi_fs",
  name: "BDI-FS",
  abbreviation: "BDI-FS",
  population: "adult",
  raterRole: "self",
  instrumentType: "likert_battery",
  cadenceType: "periodic",
  cadenceConfig: {},
  definitionStatus: "complete",
  items: [item({ id: "B1", min: 0, max: 3 }), item({ id: "B7", min: 0, max: 3 })],
  scales: [
    { key: "total", label: "Total", formula: { type: "sum", items: ["B1", "B7"] }, higherIsBetter: false, sortOrder: 0 },
    {
      key: "suicide",
      label: "Suizid",
      formula: { type: "mean", items: ["B7"] },
      higherIsBetter: false,
      alert: { gte: 1, message: "!" },
      sortOrder: 1,
    } as ScaleDef,
  ],
  sourceNotes: "",
};

const resp = (id: string, at: string, answers: Record<string, number | string>, scores: Record<string, number>, role = "self"): ResponseRecord => ({
  id,
  instrumentId: "bdi_fs",
  respondentRole: role,
  sessionNumber: null,
  wave: null,
  conductedById: null,
  occurredAt: at,
  rawAnswers: answers,
  status: "complete",
  source: "manual_entry",
  note: "private text",
  scores,
});

describe("previousResponse", () => {
  const a = resp("a", "2026-01-01T12:00:00Z", { B1: 2, B7: 0 }, { total: 2, suicide: 0 });
  const b = resp("b", "2026-01-08T12:00:00Z", { B1: 1, B7: 1 }, { total: 2, suicide: 1 });
  const other = resp("m", "2026-01-05T12:00:00Z", { B1: 3 }, {}, "mother");
  it("picks the same rater's latest earlier response", () => {
    assert.equal(previousResponse([a, other, b], b)?.id, "a");
  });
  it("returns null for the first response", () => {
    assert.equal(previousResponse([a, b], a), null);
  });
});

describe("itemRows", () => {
  const prev = resp("a", "2026-01-01T12:00:00Z", { B1: 2, B7: 0 }, { total: 2, suicide: 0 });
  const cur = resp("b", "2026-01-08T12:00:00Z", { B1: 1, B7: 1 }, { total: 2, suicide: 1 });
  const rows = itemRows(bdiLike, cur, prev);
  it("computes signed raw deltas with direction-aware favorability", () => {
    assert.equal(rows[0].delta, -1);
    assert.equal(rows[0].deltaFavorable, true); // lower BDI item = better
    assert.equal(rows[1].delta, 1);
    assert.equal(rows[1].deltaFavorable, false);
  });
  it("flags items of a firing alert scale", () => {
    assert.equal(rows[1].alert, true);
    assert.equal(rows[0].alert, false);
    assert.deepEqual([...alertItemIds(bdiLike, prev)], []);
  });
  it("has no delta without a previous response", () => {
    const first = itemRows(bdiLike, prev, null);
    assert.equal(first[0].delta, null);
    assert.equal(first[0].deltaFavorable, null);
    assert.equal(first[0].display, "2");
  });
  it("treats a reverse item's raw increase as improvement when the scale rewards it", () => {
    const inst: InstrumentDef = {
      ...bdiLike,
      items: [item({ id: "R", min: -3, max: 3, reverseScored: true })],
      scales: [{ key: "s", label: "s", formula: { type: "sum", items: ["R"] }, higherIsBetter: true, sortOrder: 0 }],
    };
    const p = resp("p", "2026-01-01T12:00:00Z", { R: 2 }, {});
    const c = resp("c", "2026-01-08T12:00:00Z", { R: -1 }, {});
    const [row] = itemRows(inst, c, p);
    assert.equal(row.delta, -3);
    assert.equal(row.deltaFavorable, true);
  });
});

describe("rawDataCsv", () => {
  const a = resp("a", "2026-01-08T12:00:00Z", { B1: 1, B7: 0 }, { total: 1, suicide: 0 });
  const b = resp("b", "2026-01-01T12:00:00Z", { B1: 2 }, { total: 2 });
  const csv = rawDataCsv(bdiLike, [a, b], "A00123");
  const lines = csv.trim().split("\n");
  it("writes code, items and scales in chronological order without notes", () => {
    assert.equal(lines[0], "patient_code,instrument,occurred_at,session_number,wave,respondent_role,source,B1,B7,total,suicide");
    assert.equal(lines[1], "A00123,bdi_fs,2026-01-01,,,self,manual_entry,2,,2,");
    assert.equal(lines[2], "A00123,bdi_fs,2026-01-08,,,self,manual_entry,1,0,1,0");
    assert.ok(!csv.includes("private text"));
  });
  it("names the file by code, never by name", () => {
    assert.equal(rawDataFileName(bdiLike, "A00123"), "A00123_bdi_fs_rohdaten.csv");
  });
});
