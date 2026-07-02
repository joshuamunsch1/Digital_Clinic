import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { addParticipant, inviteParticipant, limesurveyConfig, surveyUrl } from "@/lib/limesurvey";

/// Create a questionnaire invitation for a patient: registers them as a
/// LimeSurvey participant on the instrument's survey and sends the invitation
/// e-mail through LimeSurvey's mailer.
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
    surveyId?: string; // saved onto the instrument when provided
  };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

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

  const email = body.email || patient.email;
  if (!email) return NextResponse.json({ error: "the patient has no e-mail address on file" }, { status: 400 });
  if (body.email && body.email !== patient.email) {
    await prisma.patient.update({ where: { id: patient.id }, data: { email: body.email } });
  }

  const context: Record<string, unknown> = {};
  if (body.wave) context.wave = body.wave;
  if (body.sessionNumber !== undefined) context.sessionNumber = body.sessionNumber;

  const invitation = await prisma.questionnaireInvitation.create({
    data: {
      patientId: patient.id,
      instrumentId: instrument.id,
      respondentRole: body.respondentRole ?? instrument.raterRole,
      email,
      surveyId,
      context: JSON.stringify(context),
    },
  });

  try {
    const [firstname, ...rest] = patient.name.split(" ");
    const participant = await addParticipant(surveyId, { email, firstname, lastname: rest.join(" ") || firstname });
    await inviteParticipant(surveyId, participant.tid);
    await prisma.questionnaireInvitation.update({
      where: { id: invitation.id },
      data: {
        token: participant.token,
        tokenId: participant.tid,
        url: surveyUrl(cfg.url, surveyId, participant.token),
        status: "invited",
        sentAt: new Date(),
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
