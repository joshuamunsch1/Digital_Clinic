// Pure reminder-schedule logic (src/lib/reminders.ts) — no DB, no server.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isOverdue, nextReminderAfter, reminderDue, type ReminderFields } from "../src/lib/reminders";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 864e5).toISOString();

const base: ReminderFields = {
  channel: "limesurvey",
  status: "invited",
  remindEveryDays: 7,
  maxReminders: 3,
  reminderCount: 0,
  nextReminderAt: daysAgo(1),
  sentAt: daysAgo(8),
  remindedAt: null,
  createdAt: daysAgo(8),
};

test("nextReminderAfter adds whole days", () => {
  assert.equal(
    nextReminderAfter(7, new Date("2026-07-01T09:30:00.000Z")).toISOString(),
    "2026-07-08T09:30:00.000Z",
  );
});

test("reminderDue: due when nextReminderAt has passed and under the cap", () => {
  assert.equal(reminderDue(base, NOW), true);
});

test("reminderDue: not due before nextReminderAt", () => {
  assert.equal(reminderDue({ ...base, nextReminderAt: new Date(NOW.getTime() + 3600e3) }, NOW), false);
});

test("reminderDue: never without a schedule or a precomputed date", () => {
  assert.equal(reminderDue({ ...base, remindEveryDays: null }, NOW), false);
  assert.equal(reminderDue({ ...base, nextReminderAt: null }, NOW), false);
});

test("reminderDue: maxReminders caps automatic sending (null = uncapped)", () => {
  assert.equal(reminderDue({ ...base, reminderCount: 3 }, NOW), false);
  assert.equal(reminderDue({ ...base, reminderCount: 3, maxReminders: null }, NOW), true);
});

test("reminderDue: only for the limesurvey channel and delivered statuses", () => {
  assert.equal(reminderDue({ ...base, channel: "in_app" }, NOW), false);
  for (const status of ["created", "completed", "cancelled", "no_response", "error"]) {
    assert.equal(reminderDue({ ...base, status }, NOW), false, status);
  }
  assert.equal(reminderDue({ ...base, status: "reminded" }, NOW), true);
});

test("isOverdue: uses remindedAt, then sentAt, then createdAt as reference", () => {
  // reminded 2 days ago with a 7-day cadence -> not overdue
  assert.equal(isOverdue({ ...base, remindedAt: daysAgo(2) }, NOW), false);
  // never reminded, sent 8 days ago, cadence 7 -> overdue
  assert.equal(isOverdue(base, NOW), true);
  // in_app task created 12 days ago, weekly cadence -> overdue
  assert.equal(
    isOverdue(
      { ...base, channel: "in_app", status: "created", sentAt: null, remindedAt: null, createdAt: daysAgo(12) },
      NOW,
    ),
    true,
  );
});

test("isOverdue: default window is 7 days when no cadence is set", () => {
  const noSchedule = { ...base, remindEveryDays: null, nextReminderAt: null };
  assert.equal(isOverdue({ ...noSchedule, sentAt: daysAgo(6), createdAt: daysAgo(6) }, NOW), false);
  assert.equal(isOverdue({ ...noSchedule, sentAt: daysAgo(8), createdAt: daysAgo(8) }, NOW), true);
});

test("isOverdue: closed invitations are never overdue", () => {
  for (const status of ["completed", "cancelled", "no_response", "error"]) {
    assert.equal(isOverdue({ ...base, status, sentAt: daysAgo(90) }, NOW), false, status);
  }
});
