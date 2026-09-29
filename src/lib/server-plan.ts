// Server side of the measurement plan (Batch 16, src/lib/measurement-plan.ts):
// default-plan creation, the automatic sends when a held session is logged,
// and the sweep's interval sends.
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db";
import { limesurveyConfigured } from "./limesurvey";
import { defaultPlanItems, dueIntervalItems, sessionDispatchItems } from "./measurement-plan";
import { isOpenInvitation } from "./reminders";
import { dispatchInvitation } from "./server-dispatch";
import { PATIENT_INCLUDE, instrumentFromRow, patientFromRow } from "./serialize";
import type { InvitationContext } from "./types";

export interface PlanDispatchOutcome {
  instrumentId: string;
  channel: string;
  ok: boolean;
  warning?: string;
  error?: string;
}

const parseContext = (s: string): InvitationContext => {
  try {
    return JSON.parse(s) as InvitationContext;
  } catch {
    return {};
  }
};

/// Create the default plan (every session-cadence instrument in the patient's
/// age band) when the patient has none yet. Returns the number of items made.
export async function ensureDefaultPlan(patientId: string, db: PrismaClient = defaultPrisma): Promise<number> {
  const existing = await db.measurementPlanItem.count({ where: { patientId } });
  if (existing > 0) return 0;
  const row = await db.patient.findUnique({ where: { id: patientId }, include: PATIENT_INCLUDE });
  if (!row) return 0;
  const instruments = (await db.instrument.findMany({ include: { scales: true } })).map(instrumentFromRow);
  const items = defaultPlanItems(patientFromRow(row), instruments, limesurveyConfigured());
  for (const it of items) await db.measurementPlanItem.create({ data: { patientId, ...it } });
  return items.length;
}

/// A held session was logged: send the plan's every-session items, linked to
/// the ledger entry and carrying its session number. An OPEN request for the
/// same instrument from an EARLIER session is closed as no_response first —
/// its session is over, and the patient should see one current task, not a
/// growing stack. Paper items are returned as due (entered by hand).
export async function dispatchPlanForSession(
  patientId: string,
  log: { id: string; sessionNumber: number | null },
): Promise<{ dispatched: PlanDispatchOutcome[]; paperDue: string[] }> {
  const patient = await defaultPrisma.patient.findUnique({
    where: { id: patientId },
    include: { planItems: true, invitations: true },
  });
  if (!patient) return { dispatched: [], paperDue: [] };
  const active = patient.planItems.filter((i) => i.active && i.rhythm === "every_session");
  const paperDue = active.filter((i) => i.channel === "paper").map((i) => i.instrumentId);
  const dispatched: PlanDispatchOutcome[] = [];
  for (const item of sessionDispatchItems(active)) {
    const stale = patient.invitations.filter(
      (inv) =>
        inv.instrumentId === item.instrumentId &&
        inv.respondentRole === item.respondentRole &&
        isOpenInvitation(inv.status) &&
        inv.sessionLogId !== log.id &&
        (log.sessionNumber === null ||
          parseContext(inv.context).sessionNumber === undefined ||
          parseContext(inv.context).sessionNumber! < log.sessionNumber),
    );
    if (stale.length)
      await defaultPrisma.questionnaireInvitation.updateMany({
        where: { id: { in: stale.map((i) => i.id) } },
        data: { status: "no_response", nextReminderAt: null },
      });
    const channel = item.channel === "limesurvey" ? "limesurvey" : "in_app";
    const r = await dispatchInvitation(item.instrumentId, channel, {
      patient,
      email: patient.email,
      respondentRole: item.respondentRole,
      context: log.sessionNumber != null ? { sessionNumber: log.sessionNumber } : {},
      sessionLogId: log.id,
      remindEveryDays: item.remindEveryDays,
      maxReminders: item.maxReminders,
    });
    dispatched.push(
      r.ok
        ? { instrumentId: item.instrumentId, channel, ok: true, warning: r.warning }
        : { instrumentId: item.instrumentId, channel, ok: false, error: r.error },
    );
  }
  return { dispatched, paperDue };
}

/// Sweep step: send every interval item that is due, clinic-wide (active
/// therapies only, never simulated patients, never the paper channel).
export async function dispatchDuePlans(now: Date = new Date()): Promise<{ created: number; errors: string[] }> {
  const patients = await defaultPrisma.patient.findMany({
    where: {
      status: "therapy",
      simulated: false,
      planItems: { some: { active: true, rhythm: "interval" } },
    },
    include: {
      planItems: true,
      invitations: { select: { instrumentId: true, respondentRole: true, status: true, createdAt: true } },
      responses: { select: { instrumentId: true, respondentRole: true, occurredAt: true } },
    },
  });
  let created = 0;
  const errors: string[] = [];
  for (const p of patients) {
    for (const item of dueIntervalItems(p.planItems, p.invitations, p.responses, now)) {
      const channel = item.channel === "limesurvey" ? "limesurvey" : "in_app";
      const r = await dispatchInvitation(item.instrumentId, channel, {
        patient: p,
        email: p.email,
        respondentRole: item.respondentRole,
        context: {},
        remindEveryDays: item.remindEveryDays,
        maxReminders: item.maxReminders,
      });
      if (r.ok) created++;
      else errors.push(`${p.code ?? p.id} ${item.instrumentId}: ${r.error}`);
    }
  }
  return { created, errors };
}
