import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adherenceStats,
  attendanceFeatures,
  type AdherenceInvitationInput,
  type AttendanceLogInput,
} from "../src/lib/analytics/attendance";

const log = (type: string, day: number, sessionNumber: number | null = null): AttendanceLogInput => ({
  type,
  occurredAt: new Date(Date.UTC(2026, 0, day)),
  sessionNumber,
});

describe("attendanceFeatures", () => {
  it("computes rates over a mixed ledger", () => {
    const a = attendanceFeatures(
      [log("held", 1, 0), log("held", 8, 1), log("cancelled", 15), log("held", 22, 2), log("no_show", 29)],
      [0, 1, 2],
    );
    assert.equal(a.held, 3);
    assert.equal(a.cancelled, 1);
    assert.equal(a.noShow, 1);
    assert.equal(a.appointments, 5);
    assert.equal(a.cancellationRate, 1 / 5);
    assert.equal(a.noShowRate, 1 / 5);
    assert.equal(a.unmeasuredHeldRate, 0);
    assert.ok(a.available);
  });

  it("dedupes held logs that duplicate measured sessions (live/demo convention)", () => {
    // Every held session logged AND measured — held must not double-count.
    const a = attendanceFeatures([log("held", 1, 0), log("held", 8, 1)], [0, 1]);
    assert.equal(a.held, 2);
    assert.equal(a.appointments, 2);
    assert.equal(a.unmeasuredHeldRate, 0);
  });

  it("counts sessionNumber-less held logs as unmeasured (sim convention)", () => {
    // Sim ledger: held rows exist ONLY for unmeasured sessions, no numbers.
    const a = attendanceFeatures([log("held", 8), log("cancelled", 12)], [0, 1, 3]);
    assert.equal(a.held, 4); // 3 measured + 1 unmeasured held
    assert.equal(a.appointments, 5);
    assert.equal(a.unmeasuredHeldRate, 1 / 4);
    assert.equal(a.cancellationRate, 1 / 5);
  });

  it("held log with a number NOT in the measured set counts as unmeasured", () => {
    const a = attendanceFeatures([log("held", 8, 5)], [0, 1]);
    assert.equal(a.held, 3);
    assert.equal(a.unmeasuredHeldRate, 1 / 3);
  });

  it("empty ledger and no measurements → unavailable, null rates (never NaN)", () => {
    const a = attendanceFeatures([], []);
    assert.equal(a.available, false);
    assert.equal(a.appointments, 0);
    assert.equal(a.cancellationRate, null);
    assert.equal(a.noShowRate, null);
    assert.equal(a.unmeasuredHeldRate, null);
    assert.equal(a.recentMissStreak, 0);
  });

  it("measurements without any ledger still count as held", () => {
    const a = attendanceFeatures([], [0, 1, 2]);
    assert.ok(a.available);
    assert.equal(a.held, 3);
    assert.equal(a.cancellationRate, 0);
  });

  it("recentMissStreak counts trailing misses in date order, broken by a held log", () => {
    // Deliberately unsorted input.
    const a = attendanceFeatures(
      [log("no_show", 29), log("held", 1, 0), log("cancelled", 22), log("held", 8, 1)],
      [0, 1],
    );
    assert.equal(a.recentMissStreak, 2);
    const b = attendanceFeatures([log("cancelled", 1), log("held", 8, 1)], [1]);
    assert.equal(b.recentMissStreak, 0);
  });
});

const inv = (over: Partial<AdherenceInvitationInput>): AdherenceInvitationInput => ({
  channel: "limesurvey",
  status: "completed",
  remindEveryDays: 7,
  maxReminders: 3,
  reminderCount: 0,
  nextReminderAt: null,
  sentAt: new Date(Date.UTC(2026, 0, 1)),
  remindedAt: null,
  completedAt: new Date(Date.UTC(2026, 0, 3)),
  createdAt: new Date(Date.UTC(2026, 0, 1)),
  ...over,
});

const NOW = new Date(Date.UTC(2026, 0, 20));

describe("adherenceStats", () => {
  it("completion rate uses patient-terminal outcomes only", () => {
    const s = adherenceStats(
      [
        inv({}),
        inv({ status: "no_response", completedAt: null }),
        inv({ status: "cancelled", completedAt: null }), // staff-side: excluded
        inv({ status: "error", completedAt: null }), // system-side: excluded
        inv({ status: "invited", completedAt: null }), // still open: excluded
      ],
      NOW,
    );
    assert.equal(s.total, 5);
    assert.equal(s.completed, 1);
    assert.equal(s.completionRate, 1 / 2);
  });

  it("no decided request → null completion rate", () => {
    const s = adherenceStats([inv({ status: "invited", completedAt: null })], NOW);
    assert.equal(s.completionRate, null);
  });

  it("median latency over completed requests (odd and even counts)", () => {
    const done = (days: number) =>
      inv({ completedAt: new Date(Date.UTC(2026, 0, 1 + days)) });
    assert.equal(adherenceStats([done(1), done(3), done(10)], NOW).medianLatencyDays, 3);
    assert.equal(adherenceStats([done(1), done(3)], NOW).medianLatencyDays, 2);
  });

  it("latency falls back to createdAt when sentAt is missing (in-app)", () => {
    const s = adherenceStats(
      [inv({ channel: "in_app", sentAt: null, createdAt: new Date(Date.UTC(2026, 0, 2)), completedAt: new Date(Date.UTC(2026, 0, 5)) })],
      NOW,
    );
    assert.equal(s.medianLatencyDays, 3);
  });

  it("no completions → null latency", () => {
    const s = adherenceStats([inv({ status: "invited", completedAt: null })], NOW);
    assert.equal(s.medianLatencyDays, null);
  });

  it("reminder burden averages over sent LimeSurvey requests only", () => {
    const s = adherenceStats(
      [
        inv({ reminderCount: 2 }),
        inv({ reminderCount: 0 }),
        inv({ channel: "in_app", sentAt: null, reminderCount: 0 }),
        inv({ sentAt: null, status: "created", completedAt: null, reminderCount: 0 }),
      ],
      NOW,
    );
    assert.equal(s.remindersPerRequest, 1);
  });

  it("counts open overdue requests", () => {
    const s = adherenceStats(
      [
        // sent 19 days before NOW, cadence 7 → overdue
        inv({ status: "invited", completedAt: null }),
        // fresh: sent 1 day before NOW
        inv({ status: "invited", completedAt: null, sentAt: new Date(Date.UTC(2026, 0, 19)) }),
        // stale but terminal → not counted
        inv({ status: "no_response", completedAt: null }),
      ],
      NOW,
    );
    assert.equal(s.openOverdue, 1);
  });
});
