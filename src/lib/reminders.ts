// Pure reminder-schedule logic (client-safe: shared by the monitoring UI, the
// server sweep, and tests). E-mail reminders exist only for the "limesurvey"
// channel — LimeSurvey sends the mail; we decide WHEN. "in_app" tasks have no
// e-mail: their reminder story is the overdue flag, which keeps the task
// visible to the patient and amber-flagged for the therapist.

export const OPEN_INVITATION_STATUSES = ["created", "invited", "reminded"] as const;

export interface ReminderFields {
  channel: string;
  status: string;
  remindEveryDays: number | null;
  maxReminders: number | null;
  reminderCount: number;
  nextReminderAt: string | Date | null;
  sentAt?: string | Date | null;
  remindedAt?: string | Date | null;
  createdAt: string | Date;
}

const time = (d: string | Date | null | undefined): number | null =>
  d == null ? null : typeof d === "string" ? Date.parse(d) : d.getTime();

export const isOpenInvitation = (status: string) =>
  (OPEN_INVITATION_STATUSES as readonly string[]).includes(status);

export function nextReminderAfter(remindEveryDays: number, from: Date): Date {
  return new Date(from.getTime() + remindEveryDays * 864e5);
}

/// Should the sweep send an automatic reminder for this invitation right now?
export function reminderDue(inv: ReminderFields, now: Date): boolean {
  if (inv.channel !== "limesurvey") return false;
  if (inv.status !== "invited" && inv.status !== "reminded") return false;
  if (inv.remindEveryDays == null) return false;
  const next = time(inv.nextReminderAt);
  if (next == null || next > now.getTime()) return false;
  return inv.maxReminders == null || inv.reminderCount < inv.maxReminders;
}

/// Open invitation with no answer for longer than its reminder cadence
/// (or `defaultDays` when none is set) — surfaced as an amber chip.
export function isOverdue(inv: ReminderFields, now: Date, defaultDays = 7): boolean {
  if (!isOpenInvitation(inv.status)) return false;
  const reference = time(inv.remindedAt) ?? time(inv.sentAt) ?? time(inv.createdAt);
  if (reference == null) return false;
  return now.getTime() - reference > (inv.remindEveryDays ?? defaultDays) * 864e5;
}
