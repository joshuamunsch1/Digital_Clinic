// Server-side questionnaire dispatch (Batch 16): ONE implementation of "create
// a questionnaire request" shared by the manual send forms (invitations
// route), the measurement plan's automatic sends when a held session is
// logged (session-log route), and the background sweep's interval sends.
//
// channel "in_app": a pending task the patient fills in the portal (no
// e-mail; only fully-worded instruments). channel "limesurvey": registers the
// patient as a LimeSurvey participant and sends the invitation e-mail through
// LimeSurvey's mailer.
import { prisma } from "./db";
import { addParticipant, inviteParticipant, limesurveyConfig, surveyUrl } from "./limesurvey";
import { nextReminderAfter } from "./reminders";
import { loadInstrument } from "./server-instruments";
import { hasFullWording, isFillable } from "./instruments/types";
import type { InvitationContext } from "./types";

export type DispatchChannel = "in_app" | "limesurvey";

export type DispatchError = { ok: false; error: string; status: number };

export interface PreparedDispatch {
  ok: true;
  channel: DispatchChannel;
  instrumentId: string;
  raterRole: string;
  surveyId: string | null;
}

/// Validate that `instrumentId` can go out on `channel` (instrument exists,
/// in-app wording / LimeSurvey configuration + survey link). A surveyId
/// override is saved onto the instrument, as the manual send form does.
export async function prepareDispatch(
  instrumentId: string,
  channel: DispatchChannel,
  surveyIdOverride?: string,
): Promise<PreparedDispatch | DispatchError> {
  if (channel === "in_app") {
    const inst = await loadInstrument(instrumentId);
    if (!inst) return { ok: false, error: "unknown instrument", status: 400 };
    if (inst.def.instrumentType !== "likert_battery" || !isFillable(inst.def) || !hasFullWording(inst.def))
      return {
        ok: false,
        error: `instrument '${inst.def.id}' cannot be filled in-app (item wording not available) — send it via LimeSurvey or enter it manually`,
        status: 400,
      };
    return { ok: true, channel, instrumentId: inst.def.id, raterRole: inst.def.raterRole, surveyId: null };
  }
  if (!limesurveyConfig())
    return {
      ok: false,
      error:
        "LimeSurvey is not configured (set LIMESURVEY_URL / LIMESURVEY_USERNAME / LIMESURVEY_PASSWORD). Use CSV import as the manual fallback — see docs/limesurvey-integration.md.",
      status: 503,
    };
  const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
  if (!instrument) return { ok: false, error: "unknown instrument", status: 400 };
  if (surveyIdOverride && surveyIdOverride !== instrument.limesurveySurveyId)
    await prisma.instrument.update({ where: { id: instrument.id }, data: { limesurveySurveyId: surveyIdOverride } });
  const surveyId = surveyIdOverride || instrument.limesurveySurveyId;
  if (!surveyId)
    return {
      ok: false,
      error: `instrument '${instrument.id}' is not linked to a LimeSurvey survey yet — provide its survey id`,
      status: 400,
    };
  return { ok: true, channel, instrumentId: instrument.id, raterRole: instrument.raterRole, surveyId };
}

export interface DispatchTarget {
  patient: { id: string; name: string };
  /// Recipient address (already persisted on the patient where applicable).
  email: string | null;
  respondentRole?: string;
  context: InvitationContext;
  sessionLogId?: string | null;
  remindEveryDays?: number | null;
  maxReminders?: number | null;
}

export type DispatchResult = { ok: true; invitationId: string; warning?: string } | DispatchError;

/// Create the request for a prepared dispatch.
export async function createDispatch(prep: PreparedDispatch, t: DispatchTarget): Promise<DispatchResult> {
  const remindEveryDays = t.remindEveryDays ?? null;
  const maxReminders = t.maxReminders ?? null;
  if (prep.channel === "in_app") {
    const inv = await prisma.questionnaireInvitation.create({
      data: {
        patientId: t.patient.id,
        instrumentId: prep.instrumentId,
        respondentRole: "self", // the patient fills it in their own portal
        email: t.email ?? "",
        channel: "in_app",
        context: JSON.stringify(t.context),
        sessionLogId: t.sessionLogId ?? null,
        remindEveryDays,
        maxReminders,
      },
    });
    // warning only — the task shows up once the patient can log in
    return {
      ok: true,
      invitationId: inv.id,
      warning: t.email ? undefined : "the patient has no login e-mail yet, so they cannot see the task",
    };
  }

  const cfg = limesurveyConfig();
  if (!cfg || !prep.surveyId) return { ok: false, error: "LimeSurvey is not configured", status: 503 };
  if (!t.email) return { ok: false, error: "the patient has no e-mail address on file", status: 400 };
  const invitation = await prisma.questionnaireInvitation.create({
    data: {
      patientId: t.patient.id,
      instrumentId: prep.instrumentId,
      respondentRole: t.respondentRole ?? prep.raterRole,
      email: t.email,
      surveyId: prep.surveyId,
      context: JSON.stringify(t.context),
      sessionLogId: t.sessionLogId ?? null,
      remindEveryDays,
      maxReminders,
    },
  });

  // Two steps, persisted separately ON PURPOSE. add_participants creates the
  // token in LimeSurvey; invite_participants sends the mail through LimeSurvey's
  // mailer and is the step that fails when SMTP is misconfigured. Storing the
  // token only after a successful send would strand that participant: the token
  // exists in LimeSurvey but not here, so sync/notify could never match the
  // response and the therapist would have to re-send. Persist the token first —
  // a failed mail then leaves a usable link the therapist can hand over, and a
  // response that arrives anyway is still imported.
  try {
    const [firstname, ...rest] = t.patient.name.split(" ");
    const participant = await addParticipant(prep.surveyId, { email: t.email, firstname, lastname: rest.join(" ") || firstname });
    await prisma.questionnaireInvitation.update({
      where: { id: invitation.id },
      data: {
        token: participant.token,
        tokenId: participant.tid,
        url: surveyUrl(cfg.url, prep.surveyId, participant.token),
      },
    });
    try {
      await inviteParticipant(prep.surveyId, participant.tid);
      const sentAt = new Date();
      await prisma.questionnaireInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "invited",
          sentAt,
          nextReminderAt: remindEveryDays ? nextReminderAfter(remindEveryDays, sentAt) : null,
          lastError: null,
        },
      });
    } catch (e) {
      // Token kept, status "created" -> still an OPEN invitation, so the sweep
      // and "Sync now" keep watching it and the link stays valid.
      await prisma.questionnaireInvitation.update({
        where: { id: invitation.id },
        data: { lastError: `Einladung nicht versendet: ${(e as Error).message}` },
      });
    }
  } catch (e) {
    await prisma.questionnaireInvitation.update({
      where: { id: invitation.id },
      data: { status: "error", lastError: (e as Error).message },
    });
  }
  return { ok: true, invitationId: invitation.id };
}

/// prepare + create in one step (automatic plan sends — no email override).
export async function dispatchInvitation(
  instrumentId: string,
  channel: DispatchChannel,
  t: DispatchTarget,
): Promise<DispatchResult> {
  const prep = await prepareDispatch(instrumentId, channel);
  if (!prep.ok) return prep;
  return createDispatch(prep, t);
}
