import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { createDispatch, prepareDispatch } from "@/lib/server-dispatch";
import { therapistScoped } from "@/lib/access";
import type { InvitationContext } from "@/lib/types";

/// A positive integer or null (schedule fields are optional and validated).
const posInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;

/// Persist a changed recipient address onto the patient record — the send
/// forms edit the patient's e-mail (default = address on file). Returns an
/// error response when the address belongs to another account (same
/// patient+staff uniqueness check as registration), null on success/no-op.
async function persistPatientEmail(patientId: string, current: string | null, next: string) {
  if (!next || next === current) return null;
  const [existingPatient, existingStaff] = await Promise.all([
    prisma.patient.findUnique({ where: { email: next } }),
    prisma.user.findUnique({ where: { email: next } }),
  ]);
  if ((existingPatient && existingPatient.id !== patientId) || existingStaff)
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  await prisma.patient.update({ where: { id: patientId }, data: { email: next } });
  return null;
}

/// Create a questionnaire invitation for a patient (the manual send forms).
/// channel "limesurvey" (default): registers the patient as a LimeSurvey
/// participant and sends the invitation e-mail through LimeSurvey's mailer.
/// channel "in_app": creates a pending task the patient sees and fills in this
/// tool — no LimeSurvey, no e-mail; only fully-worded instruments qualify.
/// Optional remindEveryDays/maxReminders set up automatic periodic reminders
/// (sent by the sweep — LimeSurvey channel only). The creation itself lives in
/// src/lib/server-dispatch.ts, shared with the measurement plan's automatic
/// sends.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const body = (await req.json()) as {
    instrumentId: string;
    respondentRole?: string;
    email?: string;
    wave?: string;
    sessionNumber?: number;
    sessionLogId?: string; // ledger entry this request is sent for (held session)
    surveyId?: string; // saved onto the instrument when provided
    channel?: string;
    remindEveryDays?: number;
    maxReminders?: number;
  };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!therapistScoped(s, patient)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const channel = body.channel === "in_app" ? "in_app" : "limesurvey";
  const remindEveryDays = posInt(body.remindEveryDays);
  const maxReminders = posInt(body.maxReminders);

  const sessionLogId = body.sessionLogId || null;
  if (sessionLogId) {
    const log = await prisma.sessionLog.findUnique({ where: { id: sessionLogId } });
    if (!log || log.patientId !== params.id)
      return NextResponse.json({ error: "invalid_session_log" }, { status: 400 });
  }

  const context: InvitationContext = {};
  if (body.wave) context.wave = body.wave;
  if (body.sessionNumber !== undefined) context.sessionNumber = body.sessionNumber;

  // Instrument/channel validation (in-app wording, LimeSurvey config + survey
  // link) BEFORE any e-mail change is persisted.
  const prep = await prepareDispatch(body.instrumentId, channel, channel === "limesurvey" ? body.surveyId : undefined);
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

  // Optional override: a changed address is the patient's new login e-mail.
  const override = body.email?.trim();
  const email = override || patient.email;
  if (channel === "limesurvey" && !email)
    return NextResponse.json({ error: "the patient has no e-mail address on file" }, { status: 400 });
  const emailErr = override ? await persistPatientEmail(patient.id, patient.email, override) : null;
  if (emailErr) return emailErr;

  const result = await createDispatch(prep, {
    patient,
    email,
    respondentRole: body.respondentRole,
    context,
    sessionLogId,
    remindEveryDays,
    maxReminders,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(updated!), warning: result.warning });
}
