// Attendance & adherence analytics — the first consumer of the SessionLog
// ledger (docs/outcome-prediction.md §4.5: "wiring attendance into dose–response
// and dropout-timing models remains future work" — this is that wiring's first
// stage: descriptive rates + dropout-model features).
//
// Two ledger conventions coexist and both must yield correct counts:
//   - live/demo: every held session is logged (integrated flow), so a held log
//     row may DUPLICATE a measured session (matched by sessionNumber);
//   - simulated cohort: held rows exist ONLY for held-but-unmeasured sessions
//     and carry no sessionNumber.
// The dedupe below (held = measured occasions ∪ unmatched held logs) is exact
// for both. Pure module — no prisma; shared by server (reference build,
// prediction service) and client (monitoring surfaces).
import { isOpenInvitation, isOverdue, type ReminderFields } from "../reminders";
import { mean, percentile } from "./stats";

export interface AttendanceLogInput {
  type: string; // "held" | "cancelled" | "no_show"
  occurredAt: string | Date;
  sessionNumber: number | null;
}

export interface AttendanceFeatures {
  /// held + cancelled + noShow — every appointment the ledger/series knows of.
  appointments: number;
  /// Measured occasions (incl. baseline 0) ∪ held logs not matching a measured
  /// session — see the dedupe note in the module header.
  held: number;
  cancelled: number;
  noShow: number;
  /// Rates are null (never NaN) when their denominator is 0.
  cancellationRate: number | null;
  noShowRate: number | null;
  /// Held sessions without a questionnaire measurement / held.
  unmeasuredHeldRate: number | null;
  /// Trailing consecutive cancelled/no_show LEDGER entries (date order). Only
  /// meaningful when held sessions are logged too (live convention) — the
  /// simulated cohort's sparse ledger is not fed into this; it is a UI signal,
  /// not a model feature.
  recentMissStreak: number;
  /// Any appointment known at all — false means "no ledger, no measurements":
  /// every consumer must skip rather than treat the zeros as observed behavior.
  available: boolean;
}

const timeOf = (d: string | Date): number => (typeof d === "string" ? Date.parse(d) : d.getTime());

export function attendanceFeatures(
  logs: AttendanceLogInput[],
  measuredSessionNumbers: number[],
): AttendanceFeatures {
  const measured = new Set(measuredSessionNumbers);
  let heldUnmeasured = 0;
  let cancelled = 0;
  let noShow = 0;
  for (const log of logs) {
    if (log.type === "cancelled") cancelled++;
    else if (log.type === "no_show") noShow++;
    else if (log.type === "held" && (log.sessionNumber === null || !measured.has(log.sessionNumber)))
      heldUnmeasured++;
  }
  const held = measured.size + heldUnmeasured;
  const appointments = held + cancelled + noShow;

  let recentMissStreak = 0;
  const ordered = [...logs].sort((a, b) => timeOf(a.occurredAt) - timeOf(b.occurredAt));
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].type !== "cancelled" && ordered[i].type !== "no_show") break;
    recentMissStreak++;
  }

  return {
    appointments,
    held,
    cancelled,
    noShow,
    cancellationRate: appointments ? cancelled / appointments : null,
    noShowRate: appointments ? noShow / appointments : null,
    unmeasuredHeldRate: held ? heldUnmeasured / held : null,
    recentMissStreak,
    available: appointments > 0,
  };
}

// --- Questionnaire adherence (invitation process data) --------------------------

export type AdherenceInvitationInput = ReminderFields & {
  completedAt?: string | Date | null;
};

export interface AdherenceStats {
  total: number;
  completed: number;
  /// completed / (completed + no_response) — only PATIENT-terminal outcomes
  /// count; staff cancellations and system errors are neither adherence nor
  /// non-adherence. Null when no request has reached a patient-terminal state.
  completionRate: number | null;
  /// Median days from sentAt (fallback createdAt — in-app tasks are "sent" at
  /// creation) to completedAt, over completed requests. Null when none.
  medianLatencyDays: number | null;
  /// Mean reminderCount over SENT LimeSurvey requests (the only channel that
  /// sends reminder mails). Null when none were sent.
  remindersPerRequest: number | null;
  /// Open requests currently past their reminder cadence (isOverdue).
  openOverdue: number;
}

const maybeTime = (d: string | Date | null | undefined): number | null =>
  d == null ? null : timeOf(d);

export function adherenceStats(invitations: AdherenceInvitationInput[], now: Date): AdherenceStats {
  const completed = invitations.filter((i) => i.status === "completed");
  const noResponse = invitations.filter((i) => i.status === "no_response");
  const decided = completed.length + noResponse.length;

  const latencies: number[] = [];
  for (const inv of completed) {
    const done = maybeTime(inv.completedAt);
    const sent = maybeTime(inv.sentAt) ?? maybeTime(inv.createdAt);
    if (done !== null && sent !== null && done >= sent) latencies.push((done - sent) / 864e5);
  }

  const sentLimesurvey = invitations.filter((i) => i.channel === "limesurvey" && i.sentAt != null);

  return {
    total: invitations.length,
    completed: completed.length,
    completionRate: decided ? completed.length / decided : null,
    medianLatencyDays: latencies.length ? percentile(latencies, 0.5) : null,
    remindersPerRequest: sentLimesurvey.length ? mean(sentLimesurvey.map((i) => i.reminderCount)) : null,
    openOverdue: invitations.filter((i) => isOpenInvitation(i.status) && isOverdue(i, now)).length,
  };
}
