import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daysSince, latestPrimary, statusLight } from "../src/lib/analytics/cockpit";
import type { CockpitSummaryInput } from "../src/lib/analytics/cockpit";

const summary = (over: Partial<CockpitSummaryInput>): CockpitSummaryInput => ({
  earlyChange: null,
  onTrack: "unknown",
  dropoutRisk: null,
  ...over,
});

describe("statusLight", () => {
  it("red beats everything (safety alert wins over on-track)", () => {
    assert.equal(statusLight(1, summary({ onTrack: "on_track" })), "red");
  });

  it("amber on not-on-track OR early deterioration", () => {
    assert.equal(statusLight(0, summary({ onTrack: "not_on_track" })), "amber");
    assert.equal(statusLight(0, summary({ onTrack: "on_track", earlyChange: "early_deterioration" })), "amber");
  });

  it("green only on on-track without amber conditions", () => {
    assert.equal(statusLight(0, summary({ onTrack: "on_track" })), "green");
    assert.equal(statusLight(0, summary({ onTrack: "on_track", earlyChange: "early_response" })), "green");
  });

  it("grey for unknown status or missing summary", () => {
    assert.equal(statusLight(0, summary({})), "grey");
    assert.equal(statusLight(0, undefined), "grey");
  });
});

describe("latestPrimary", () => {
  it("last value + signed delta vs previous session", () => {
    const r = latestPrimary([
      { session: 0, value: 9 },
      { session: 1, value: 7 },
      { session: 2, value: 8 },
    ]);
    assert.equal(r.value, 8);
    assert.equal(r.delta, 1);
    assert.equal(r.session, 2);
  });

  it("sorts unsorted input by session", () => {
    const r = latestPrimary([
      { session: 3, value: 4 },
      { session: 1, value: 8 },
    ]);
    assert.equal(r.value, 4);
    assert.equal(r.delta, -4);
  });

  it("single point → delta null; empty → all null", () => {
    assert.equal(latestPrimary([{ session: 0, value: 5 }]).delta, null);
    assert.deepEqual(latestPrimary([]), { value: null, delta: null, session: null });
  });
});

describe("daysSince", () => {
  const now = new Date(Date.UTC(2026, 6, 18));
  it("whole days, floored, never negative", () => {
    assert.equal(daysSince(new Date(Date.UTC(2026, 6, 11)).toISOString(), now), 7);
    assert.equal(daysSince(new Date(Date.UTC(2026, 6, 17, 20)).toISOString(), now), 0);
    assert.equal(daysSince(new Date(Date.UTC(2026, 6, 20)).toISOString(), now), 0);
  });

  it("null for null or unparseable input", () => {
    assert.equal(daysSince(null, now), null);
    assert.equal(daysSince("not-a-date", now), null);
  });
});
