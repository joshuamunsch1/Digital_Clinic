import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { remindParticipant } from "@/lib/limesurvey";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";

/// PATCH { action: "remind" } — send a reminder e-mail for an open invitation.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { action: string };
  if (body.action !== "remind") return NextResponse.json({ error: "unknown action" }, { status: 400 });

  const inv = await prisma.questionnaireInvitation.findUnique({ where: { id: params.id } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inv.status === "completed") return NextResponse.json({ error: "already completed" }, { status: 400 });
  if (!inv.surveyId || !inv.tokenId)
    return NextResponse.json({ error: "invitation was never delivered to LimeSurvey" }, { status: 400 });

  try {
    await remindParticipant(inv.surveyId, inv.tokenId);
    await prisma.questionnaireInvitation.update({
      where: { id: inv.id },
      data: { status: "reminded", remindedAt: new Date(), lastError: null },
    });
  } catch (e) {
    await prisma.questionnaireInvitation.update({
      where: { id: inv.id },
      data: { lastError: (e as Error).message },
    });
  }

  const patient = await prisma.patient.findUnique({ where: { id: inv.patientId }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(patient!) });
}
