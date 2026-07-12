import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientForSession } from "@/lib/serialize";
import { createResponse, loadInstrument } from "@/lib/server-instruments";
import { isFillable, type RawAnswers } from "@/lib/instruments/types";
import { isOpenInvitation } from "@/lib/reminders";
import type { InvitationContext } from "@/lib/types";

const parseContext = (s: string): InvitationContext => {
  try {
    return JSON.parse(s) as InvitationContext;
  } catch {
    return {};
  }
};

/// Submit one filled-out questionnaire (patient in-app, or therapist manual entry).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // patients can only submit for themselves (and may do so from any network);
  // staff manual entry requires the clinic network
  if (s.role === "patient" && s.id !== params.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (s.role === "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const body = (await req.json()) as {
    instrumentId: string;
    rawAnswers: RawAnswers;
    respondentRole?: string;
    sessionNumber?: number | null;
    wave?: string | null;
    occurredAt?: string;
    note?: string;
    invitationId?: string; // set when this submission answers an in-app task
    conductedById?: string | null;
  };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Who conducted/recorded this occasion (mirrors the legacy PSTB "Therapeut"
  // column). Patients can't attribute their own self-submission to an arbitrary
  // staff member — always fall back to the patient's current assignment for
  // them. Staff manual entry may pick a different clinician (co-therapy,
  // substitution), defaulting to the current assignment when not specified.
  const conductedById = s.role === "patient" ? patient.therapistId : (body.conductedById ?? patient.therapistId ?? null);

  const inst = await loadInstrument(body.instrumentId);
  if (!inst) return NextResponse.json({ error: "unknown instrument" }, { status: 400 });
  if (!isFillable(inst.def) || inst.def.instrumentType === "structured_interview")
    return NextResponse.json(
      { error: `instrument '${inst.def.id}' cannot be submitted through the generic form (definition ${inst.def.definitionStatus})` },
      { status: 400 },
    );

  // An in-app task being answered: validate it and take wave/session defaults
  // from the context the therapist set when creating it.
  let invitation = null;
  if (body.invitationId) {
    invitation = await prisma.questionnaireInvitation.findUnique({ where: { id: body.invitationId } });
    if (
      !invitation ||
      invitation.patientId !== params.id ||
      invitation.channel !== "in_app" ||
      invitation.instrumentId !== body.instrumentId ||
      !isOpenInvitation(invitation.status)
    )
      return NextResponse.json({ error: "invalid invitation for this submission" }, { status: 400 });
  }
  const ctx = invitation ? parseContext(invitation.context) : {};

  const { response, skipped } = await createResponse(inst, {
    patientId: params.id,
    respondentRole: body.respondentRole ?? "self",
    rawAnswers: body.rawAnswers,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    sessionNumber: body.sessionNumber ?? ctx.sessionNumber ?? null,
    wave: body.wave ?? ctx.wave ?? null,
    note: body.note,
    conductedById,
    source: s.role === "patient" ? "in_app" : "manual_entry",
  });

  if (invitation) {
    await prisma.questionnaireInvitation.update({
      where: { id: invitation.id },
      data: { status: "completed", completedAt: new Date(), responseId: response.id, nextReminderAt: null },
    });
  }

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientForSession(updated!, s.role), skippedScales: skipped });
}
