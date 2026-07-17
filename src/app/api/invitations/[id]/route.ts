import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { remindParticipant } from "@/lib/limesurvey";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { isOpenInvitation, nextReminderAfter } from "@/lib/reminders";

/// PATCH one invitation:
///   { action: "remind" }   — send a reminder e-mail now (LimeSurvey channel)
///   { action: "schedule", remindEveryDays, maxReminders } — set/clear the
///                             automatic reminder schedule
///   { action: "cancel" }   — close an unanswered invitation / in-app task
///   { action: "no_response" } — close a stale open request as "the patient
///                             never answered" (terminal, distinct from cancel)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const body = (await req.json()) as {
    action: string;
    remindEveryDays?: number | null;
    maxReminders?: number | null;
  };

  const inv = await prisma.questionnaireInvitation.findUnique({ where: { id: params.id } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "remind") {
    if (!isOpenInvitation(inv.status))
      return NextResponse.json({ error: "invitation is closed" }, { status: 400 });
    if (inv.channel === "in_app")
      return NextResponse.json({ error: "in-app tasks have no e-mail reminders — the task stays visible to the patient" }, { status: 400 });
    if (!inv.surveyId || !inv.tokenId)
      return NextResponse.json({ error: "invitation was never delivered to LimeSurvey" }, { status: 400 });

    try {
      await remindParticipant(inv.surveyId, inv.tokenId);
      const now = new Date();
      const count = inv.reminderCount + 1;
      const capped = inv.maxReminders != null && count >= inv.maxReminders;
      await prisma.questionnaireInvitation.update({
        where: { id: inv.id },
        data: {
          status: "reminded",
          remindedAt: now,
          reminderCount: count,
          // a manual reminder also restarts the automatic cadence
          nextReminderAt:
            capped || inv.remindEveryDays == null ? null : nextReminderAfter(inv.remindEveryDays, now),
          lastError: null,
        },
      });
    } catch (e) {
      await prisma.questionnaireInvitation.update({
        where: { id: inv.id },
        data: { lastError: (e as Error).message },
      });
    }
  } else if (body.action === "schedule") {
    // error rows stay schedulable (a retry may revive them); terminal ones don't.
    if (!isOpenInvitation(inv.status) && inv.status !== "error")
      return NextResponse.json({ error: "invitation is closed" }, { status: 400 });
    const remindEveryDays =
      body.remindEveryDays == null
        ? null
        : Number.isInteger(body.remindEveryDays) && body.remindEveryDays > 0
          ? body.remindEveryDays
          : undefined;
    const maxReminders =
      body.maxReminders == null
        ? null
        : Number.isInteger(body.maxReminders) && body.maxReminders > 0
          ? body.maxReminders
          : undefined;
    if (remindEveryDays === undefined || maxReminders === undefined)
      return NextResponse.json({ error: "remindEveryDays / maxReminders must be positive integers (or null)" }, { status: 400 });

    const capped = maxReminders != null && inv.reminderCount >= maxReminders;
    const reference = inv.remindedAt ?? inv.sentAt ?? new Date();
    await prisma.questionnaireInvitation.update({
      where: { id: inv.id },
      data: {
        remindEveryDays,
        maxReminders,
        nextReminderAt:
          remindEveryDays == null || capped || inv.channel !== "limesurvey"
            ? null
            : nextReminderAfter(remindEveryDays, reference),
      },
    });
  } else if (body.action === "cancel") {
    if (!isOpenInvitation(inv.status) && inv.status !== "error")
      return NextResponse.json({ error: "invitation is already closed" }, { status: 400 });
    await prisma.questionnaireInvitation.update({
      where: { id: inv.id },
      data: { status: "cancelled", nextReminderAt: null },
    });
  } else if (body.action === "no_response") {
    // Only genuinely open requests can be declared unanswered — "error" would
    // misstate a delivery failure as patient silence (cancel those instead).
    if (!isOpenInvitation(inv.status))
      return NextResponse.json({ error: "invitation is already closed" }, { status: 400 });
    await prisma.questionnaireInvitation.update({
      where: { id: inv.id },
      data: { status: "no_response", nextReminderAt: null },
    });
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({ where: { id: inv.patientId }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(patient!) });
}
