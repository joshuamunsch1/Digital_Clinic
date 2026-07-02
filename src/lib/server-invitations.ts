// Server-side invitation lifecycle: pull completed LimeSurvey responses back
// into the generic response model (used by the manual "Sync now" endpoint and
// the notify endpoint that LimeSurvey's end-URL/webhook hits on completion).
import { prisma } from "./db";
import { exportResponseByToken } from "./limesurvey";
import { createResponse, extractRawAnswers, loadInstrument } from "./server-instruments";
import type { InvitationContext } from "./types";

type InvitationRow = NonNullable<Awaited<ReturnType<typeof prisma.questionnaireInvitation.findUnique>>>;

/// Check one open invitation against LimeSurvey; import + score the response if
/// the participant has completed. Returns what happened for reporting.
export async function importCompletedInvitation(
  inv: InvitationRow,
): Promise<"imported" | "pending" | "skipped"> {
  if (inv.status === "completed" || !inv.surveyId || !inv.token) return "skipped";
  const fields = await exportResponseByToken(inv.surveyId, inv.token);
  if (!fields) return "pending";

  const inst = await loadInstrument(inv.instrumentId);
  if (!inst) return "skipped";
  const rawAnswers = extractRawAnswers(inst.def, fields);
  const ctx = parseContext(inv.context);
  const submitdate = typeof fields["submitdate"] === "string" ? new Date(fields["submitdate"] as string) : null;

  const { response } = await createResponse(inst, {
    patientId: inv.patientId,
    respondentRole: inv.respondentRole,
    rawAnswers,
    occurredAt: submitdate && !Number.isNaN(submitdate.getTime()) ? submitdate : new Date(),
    sessionNumber: ctx.sessionNumber ?? null,
    wave: ctx.wave ?? null,
    source: "limesurvey",
    meta: { limesurvey: { surveyId: inv.surveyId, token: inv.token } },
  });
  await prisma.questionnaireInvitation.update({
    where: { id: inv.id },
    data: { status: "completed", completedAt: new Date(), responseId: response.id, lastError: null },
  });
  return "imported";
}

function parseContext(s: string): InvitationContext {
  try {
    return JSON.parse(s) as InvitationContext;
  } catch {
    return {};
  }
}

/// Walk every open invitation (optionally for one patient) and import whatever
/// LimeSurvey reports complete. Individual failures don't abort the sweep.
export async function syncInvitations(patientId?: string) {
  const open = await prisma.questionnaireInvitation.findMany({
    where: {
      status: { in: ["invited", "reminded"] },
      ...(patientId ? { patientId } : {}),
    },
  });
  const result = { checked: open.length, imported: 0, pending: 0, errors: [] as string[] };
  for (const inv of open) {
    try {
      const outcome = await importCompletedInvitation(inv);
      if (outcome === "imported") result.imported++;
      else if (outcome === "pending") result.pending++;
    } catch (e) {
      const msg = (e as Error).message;
      result.errors.push(`${inv.id}: ${msg}`);
      await prisma.questionnaireInvitation.update({
        where: { id: inv.id },
        data: { lastError: msg },
      });
    }
  }
  return result;
}
