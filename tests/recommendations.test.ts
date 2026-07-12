// Recommendation lookup (src/lib/recommendations.ts) — pure, no DB.
import assert from "node:assert/strict";
import { test } from "node:test";
import { recommendationsForPatient, recommendedInstrumentIds } from "../src/lib/recommendations";
import { SAMPLE_ANSWERS } from "../src/lib/demo";
import type { DipsRecord } from "../src/lib/types";
import type { InstrumentDef } from "../src/lib/instruments/types";

const dips: DipsRecord = { lang: "de", completedAt: "2026-07-01T00:00:00.000Z", answers: SAMPLE_ANSWERS };

const stubInstruments = ["phq4", "bdi_fs", "dikj", "edeq8", "wbq", "conners3_self_short"].map(
  (id) => ({ id }) as InstrumentDef,
);

test("specific DIPS diagnosis beats the category fallback", () => {
  const sets = recommendationsForPatient({ disorderCategory: "anxiety", dips });
  assert.equal(sets[0].key, "panic_disorder");
  // generic anxiety category set is omitted when a specific anxiety diagnosis matched
  assert.ok(!sets.some((s) => s.key === "anxiety"));
});

test("category-only patient gets the category fallback", () => {
  const sets = recommendationsForPatient({ disorderCategory: "depression", dips: null });
  assert.equal(sets.length, 1);
  assert.equal(sets[0].key, "depression");
  assert.ok(sets[0].guidelines[0].registryNr === "nvl-005");
});

test("specific diagnosis + non-anxiety category are unioned", () => {
  const sets = recommendationsForPatient({ disorderCategory: "depression", dips });
  assert.deepEqual(sets.map((s) => s.key), ["panic_disorder", "depression"]);
});

test("burnout maps zero catalog instruments but has external ones + honest guideline state", () => {
  const sets = recommendationsForPatient({ disorderCategory: "burnout", dips: null });
  assert.equal(sets[0].catalogInstrumentIds.length, 0);
  assert.ok(sets[0].external.length >= 3);
  assert.match(sets[0].guidelines[0].title, /keine eigenständige S3/);
  assert.equal(recommendedInstrumentIds({ disorderCategory: "burnout", dips: null }, stubInstruments).size, 0);
});

test("recommendedInstrumentIds filters against the loaded catalog", () => {
  const ids = recommendedInstrumentIds({ disorderCategory: "depression", dips: null }, stubInstruments);
  assert.deepEqual([...ids].sort(), ["bdi_fs", "dikj", "phq4"]);
  // an instrument list without those ids yields nothing
  assert.equal(recommendedInstrumentIds({ disorderCategory: "depression", dips: null }, []).size, 0);
});

test("no diagnosis, no category -> no recommendations", () => {
  assert.deepEqual(recommendationsForPatient({ disorderCategory: null, dips: null }), []);
});
