// One sweep = (1) pull completed LimeSurvey responses, then (2) send due
// automatic reminder e-mails through LimeSurvey (remind_participants) per each
// invitation's schedule. Sync runs first so nobody is reminded about a
// questionnaire they just completed. Called by the background scheduler
// (src/lib/reminder-scheduler.ts) and by POST /api/reminders/run.
import { prisma } from "./db";
import { limesurveyConfigured, remindParticipant } from "./limesurvey";
import { nextReminderAfter, reminderDue } from "./reminders";
import { syncInvitations } from "./server-invitations";

export interface SweepResult {
  skipped?: string;
  sync?: { checked: number; imported: number; pending: number; errors: string[] };
  reminders?: { due: number; sent: number; errors: string[] };
}

let running = false;

export async function runReminderSweep(): Promise<SweepResult> {
  if (running) return { skipped: "a sweep is already running" };
  if (!limesurveyConfigured()) return { skipped: "limesurvey not configured" };
  running = true;
  try {
    const sync = await syncInvitations();

    const now = new Date();
    const candidates = await prisma.questionnaireInvitation.findMany({
      where: {
        channel: "limesurvey",
        status: { in: ["invited", "reminded"] },
        nextReminderAt: { lte: now },
      },
    });
    // SQLite can't compare reminderCount < maxReminders column-to-column in the
    // where clause, so the cap is re-checked here.
    const due = candidates.filter((inv) => reminderDue(inv, now));
    const reminders = { due: due.length, sent: 0, errors: [] as string[] };

    for (const inv of due) {
      if (!inv.surveyId || !inv.tokenId) continue;
      try {
        await remindParticipant(inv.surveyId, inv.tokenId);
        const count = inv.reminderCount + 1;
        const capped = inv.maxReminders != null && count >= inv.maxReminders;
        await prisma.questionnaireInvitation.update({
          where: { id: inv.id },
          data: {
            status: "reminded",
            remindedAt: now,
            reminderCount: count,
            nextReminderAt:
              capped || inv.remindEveryDays == null ? null : nextReminderAfter(inv.remindEveryDays, now),
            lastError: null,
          },
        });
        reminders.sent++;
      } catch (e) {
        const msg = (e as Error).message;
        reminders.errors.push(`${inv.id}: ${msg}`);
        await prisma.questionnaireInvitation.update({ where: { id: inv.id }, data: { lastError: msg } });
      }
    }
    return { sync, reminders };
  } finally {
    running = false;
  }
}
