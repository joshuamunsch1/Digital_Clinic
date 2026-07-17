import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { addParticipant, inviteParticipant, limesurveyConfig, surveyUrl } from "@/lib/limesurvey";
import { nextReminderAfter } from "@/lib/reminders";
import { loadInstrument } from "@/lib/server-instruments";
import { hasFullWording, isFillable } from "@/lib/instruments/types";

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

/// Create a questionnaire invitation for a patient.
/// channel "limesurvey" (default): registers the patient as a LimeSurvey
/// participant and sends the invitation e-mail through LimeSurvey's mailer.
/// channel "in_app": creates a pending task the patient sees and fills in this
/// tool — no LimeSurvey, no e-mail; only fully-worded instruments qualify.
/// Optional remindEveryDays/maxReminders set up automatic periodic reminders
/// (sent by the sweep — LimeSurvey channel only).
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

  const channel = body.channel === "in_app" ? "in_app" : "limesurvey";
  const remindEveryDays = posInt(body.remindEveryDays);
  const maxReminders = posInt(body.maxReminders);

  const sessionLogId = body.sessionLogId || null;
  if (sessionLogId) {
    const log = await prisma.sessionLog.findUnique({ where: { id: sessionLogId } });
    if (!log || log.patientId !== params.id)
      return NextResponse.json({ error: "invalid_session_log" }, { status: 400 });
  }

  const context: Record<string, unknown> = {};
  if (body.wave) context.wave = body.wave;
  if (body.sessionNumber !== undefined) context.sessionNumber = body.sessionNumber;

  if (channel === "in_app") {
    const inst = await loadInstrument(body.instrumentId);
    if (!inst) return NextResponse.json({ error: "unknown instrument" }, { status: 400 });
    if (inst.def.instrumentType !== "likert_battery" || !isFillable(inst.def) || !hasFullWording(inst.def))
      return NextResponse.json(
        { error: `instrument '${inst.def.id}' cannot be filled in-app (item wording not available) — send it via LimeSurvey or enter it manually` },
        { status: 400 },
      );
    // Optional override: a changed address is the patient's new login e-mail.
    const email = body.email?.trim() || patient.email;
    const emailErr = body.email?.trim()
      ? await persistPatientEmail(patient.id, patient.email, body.email.trim())
      : null;
    if (emailErr) return emailErr;
    await prisma.questionnaireInvitation.create({
      data: {
        patientId: patient.id,
        instrumentId: inst.def.id,
        respondentRole: "self", // the patient fills it in their own portal
        email: email ?? "",
        channel: "in_app",
        context: JSON.stringify(context),
        sessionLogId,
        remindEveryDays,
        maxReminders,
      },
    });
    const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
    return NextResponse.json({
      patient: patientFromRow(updated!),
      // warning only — the task shows up once the patient can log in
      warning: email ? undefined : "the patient has no login e-mail yet, so they cannot see the task",
    });
  }

  const cfg = limesurveyConfig();
  if (!cfg)
    return NextResponse.json(
      { error: "LimeSurvey is not configured (set LIMESURVEY_URL / LIMESURVEY_USERNAME / LIMESURVEY_PASSWORD). Use CSV import as the manual fallback — see docs/limesurvey-integration.md." },
      { status: 503 },
    );

  const instrument = await prisma.instrument.findUnique({ where: { id: body.instrumentId } });
  if (!instrument) return NextResponse.json({ error: "unknown instrument" }, { status: 400 });

  if (body.surveyId && body.surveyId !== instrument.limesurveySurveyId) {
    await prisma.instrument.update({ where: { id: instrument.id }, data: { limesurveySurveyId: body.surveyId } });
  }
  const surveyId = body.surveyId || instrument.limesurveySurveyId;
  if (!surveyId)
    return NextResponse.json(
      { error: `instrument '${instrument.id}' is not linked to a LimeSurvey survey yet — provide its survey id` },
      { status: 400 },
    );

  const email = body.email?.trim() || patient.email;
  if (!email) return NextResponse.json({ error: "the patient has no e-mail address on file" }, { status: 400 });
  const emailErr = body.email?.trim()
    ? await persistPatientEmail(patient.id, patient.email, body.email.trim())
    : null;
  if (emailErr) return emailErr;

  const invitation = await prisma.questionnaireInvitation.create({
    data: {
      patientId: patient.id,
      instrumentId: instrument.id,
      respondentRole: body.respondentRole ?? instrument.raterRole,
      email,
      surveyId,
      context: JSON.stringify(context),
      sessionLogId,
      remindEveryDays,
      maxReminders,
    },
  });

  try {
    const [firstname, ...rest] = patient.name.split(" ");
    const participant = await addParticipant(surveyId, { email, firstname, lastname: rest.join(" ") || firstname });
    await inviteParticipant(surveyId, participant.tid);
    const sentAt = new Date();
    await prisma.questionnaireInvitation.update({
      where: { id: invitation.id },
      data: {
        token: participant.token,
        tokenId: participant.tid,
        url: surveyUrl(cfg.url, surveyId, participant.token),
        status: "invited",
        sentAt,
        nextReminderAt: remindEveryDays ? nextReminderAfter(remindEveryDays, sentAt) : null,
      },
    });
  } catch (e) {
    await prisma.questionnaireInvitation.update({
      where: { id: invitation.id },
      data: { status: "error", lastError: (e as Error).message },
    });
  }

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(updated!) });
}
