import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  WEEK_MS,
  binByWeek,
  dateForSession,
  firstMeasurementAt,
  intervalStats,
  seriesAnchor,
  sessionDateMap,
  sessionStepMs,
  weekSeriesOf,
  weeksSince,
} from "../src/lib/analytics/time-axis";
import { buildExpectedCourse, pooledValues } from "../src/lib/analytics/expected-course";

const T0 = Date.parse("2026-01-05T12:00:00Z");
const iso = (days: number) => new Date(T0 + days * DAY_MS).toISOString();

describe("weeks since therapy start", () => {
  it("anchors on the therapy start, else the first measurement", () => {
    assert.equal(seriesAnchor(iso(0), T0 + 99), T0);
    assert.equal(seriesAnchor(null, 42), 42);
    assert.equal(seriesAnchor(null, null), null);
  });
  it("floors to whole weeks and clamps pre-start measurements to week 0", () => {
    assert.equal(weeksSince(T0, T0), 0);
    assert.equal(weeksSince(T0, T0 + 6 * DAY_MS), 0);
    assert.equal(weeksSince(T0, T0 + 7 * DAY_MS), 1);
    assert.equal(weeksSince(T0, T0 - 20 * DAY_MS), 0);
  });
  it("keeps the latest value per week", () => {
    const series = binByWeek(
      [
        { at: T0 - 3 * DAY_MS, value: 10 }, // intake before start → week 0
        { at: T0 + 1 * DAY_MS, value: 9 }, // later in week 0 → wins
        { at: T0 + 15 * DAY_MS, value: 6 },
      ],
      T0,
    );
    assert.deepEqual(series, [
      { session: 0, value: 9 },
      { session: 2, value: 6 },
    ]);
  });
  it("weekly vs. monthly patients land on comparable weeks", () => {
    const resp = (days: number, v: number) => ({ instrumentId: "bdi_fs", occurredAt: iso(days), scores: { BDI_FS_total: v } });
    const weekly = [resp(0, 12), resp(7, 11), resp(14, 10)];
    const monthly = [resp(0, 12), resp(42, 7)];
    assert.deepEqual(weekSeriesOf(weekly, "bdi_fs", "BDI_FS_total", T0).map((p) => p.session), [0, 1, 2]);
    // Index alignment would call the 2nd monthly measurement "occasion 1";
    // the weeks axis puts it at week 6 where it belongs.
    assert.deepEqual(weekSeriesOf(monthly, "bdi_fs", "BDI_FS_total", T0).map((p) => p.session), [0, 6]);
    assert.equal(firstMeasurementAt(monthly, "bdi_fs", "BDI_FS_total"), T0);
    assert.equal(firstMeasurementAt(monthly, "phq4", "PHQ_total"), null);
  });
});

describe("session dates", () => {
  const responses = [
    { sessionNumber: 0, occurredAt: iso(0) },
    { sessionNumber: 1, occurredAt: iso(7) },
    { sessionNumber: 1, occurredAt: iso(7.1) },
    { sessionNumber: 3, occurredAt: iso(28) },
    { sessionNumber: null, occurredAt: iso(30) },
  ];
  const logs = [
    { type: "held", sessionNumber: 4, occurredAt: iso(42) },
    { type: "cancelled", sessionNumber: null, occurredAt: iso(35) },
    { type: "held", sessionNumber: 1, occurredAt: iso(8) }, // response date wins
  ];
  const known = sessionDateMap(responses, logs);
  it("uses response dates, then held-log dates", () => {
    assert.equal(known.get(1), T0 + 7 * DAY_MS);
    assert.equal(known.get(4), T0 + 42 * DAY_MS);
    assert.equal(known.size, 4);
  });
  it("interpolates gaps and projects beyond the last session", () => {
    const s2 = dateForSession(known, 2)!;
    assert.equal(s2.projected, false);
    assert.equal(s2.t, T0 + 17.5 * DAY_MS);
    const step = sessionStepMs(known);
    const s6 = dateForSession(known, 6)!;
    assert.equal(s6.projected, true);
    assert.equal(s6.t, T0 + 42 * DAY_MS + 2 * step);
  });
  it("falls back to a one-week rhythm and handles empty maps", () => {
    assert.equal(sessionStepMs(new Map([[1, T0]])), WEEK_MS);
    assert.equal(dateForSession(new Map(), 3), null);
  });
  it("summarizes the measurement rhythm", () => {
    assert.deepEqual(intervalStats([T0, T0 + 7 * DAY_MS, T0 + 21 * DAY_MS]), { medianDays: 11, minDays: 7, maxDays: 14 });
    assert.equal(intervalStats([T0]), null);
  });
});

describe("windowed expected course", () => {
  // Three cases measured at scattered weeks (pre / mid / post like the
  // reference BDI-FS waves).
  const ref = [
    [{ session: 0, value: 12 }, { session: 9, value: 8 }, { session: 20, value: 4 }],
    [{ session: 0, value: 10 }, { session: 10, value: 7 }, { session: 18, value: 5 }],
    [{ session: 0, value: 14 }, { session: 11, value: 9 }, { session: 21, value: 6 }],
  ];
  it("exact pooling leaves sparse weeks empty", () => {
    const course = buildExpectedCourse(ref, { minN: 3 });
    assert.deepEqual(course.map((p) => p.session), [0]);
  });
  it("window pools the nearest point per case, each case once", () => {
    const pooled = pooledValues(ref, { window: 1 });
    assert.deepEqual(pooled.get(10), [8, 7, 9]);
    assert.equal(pooled.get(5), undefined); // a real gap stays a gap
    // ±1 week: week 1 still reaches every case's week-0 point; week 20 only
    // reaches two cases (the third sits at 18) → below minN, omitted.
    const course = buildExpectedCourse(ref, { minN: 3, window: 1 });
    assert.deepEqual(course.map((p) => p.session), [0, 1, 10]);
    assert.equal(course.find((p) => p.session === 10)!.n, 3);
    assert.deepEqual(pooledValues(ref, { window: 1 }).get(20), [4, 6]);
  });
  it("ties go to the earlier point", () => {
    const pooled = pooledValues([[{ session: 4, value: 1 }, { session: 6, value: 2 }]], { window: 1 });
    assert.deepEqual(pooled.get(5), [1]);
  });
});
