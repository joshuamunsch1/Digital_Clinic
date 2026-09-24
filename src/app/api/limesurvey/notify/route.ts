import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limesurveyConfigured } from "@/lib/limesurvey";
import { OPEN_INVITATION_STATUSES } from "@/lib/reminders";
import { importCompletedInvitation } from "@/lib/server-invitations";

// Completion ping from LimeSurvey — either the survey's end-URL
// (…/api/limesurvey/notify?sid={SID}&token={TOKEN}) or a webhook plugin POST.
// Deliberately unauthenticated (the participant's browser hits it), so it
// discloses nothing and only triggers a server-to-server pull of a response
// that an open invitation is already expecting.

interface NotifyResult {
  httpStatus: number;
  body: { ok: boolean; outcome?: string; reason?: string };
}

async function handle(sid: string | null, token: string | null): Promise<NotifyResult> {
  if (!limesurveyConfigured()) return { httpStatus: 503, body: { ok: false, reason: "not configured" } };
  if (!sid || !token) return { httpStatus: 400, body: { ok: false, reason: "missing sid/token" } };
  const inv = await prisma.questionnaireInvitation.findFirst({
    where: { surveyId: sid, token, status: { in: [...OPEN_INVITATION_STATUSES] } },
  });
  if (!inv) return { httpStatus: 200, body: { ok: true, outcome: "no matching open invitation" } };
  try {
    const outcome = await importCompletedInvitation(inv);
    return { httpStatus: 200, body: { ok: true, outcome } };
  } catch (e) {
    return { httpStatus: 502, body: { ok: false, reason: (e as Error).message } };
  }
}

/// The patient's browser, redirected here by the survey's end URL. The import
/// runs first (the patient waits for it — usually well under a second), then
/// the browser goes to a thank-you page that looks the same whatever happened:
/// the patient's answers are safe in LimeSurvey either way (a failed import is
/// retried by the sync sweep), and an unauthenticated URL must not tell a
/// visitor whether a token exists. The outcome goes to the server log instead —
/// that is where a local test reads it. The token is not logged.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid");
  const result = await handle(sid, url.searchParams.get("token"));
  console.log(
    `[limesurvey/notify] sid=${sid ?? "-"} -> ${result.body.outcome ?? result.body.reason ?? "?"} (${result.httpStatus})`,
  );
  // Relative Location + 303: correct behind a reverse proxy (no internal host
  // leaks into the redirect) and always turns into a plain GET.
  return new Response(null, { status: 303, headers: { Location: "/survey-complete" } });
}

/// Webhook plugins (server-to-server) keep the machine-readable answer.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sid = body.sid ?? body.surveyId ?? body.survey_id;
  const token = body.token;
  const result = await handle(sid != null ? String(sid) : null, token != null ? String(token) : null);
  // Keep the pre-existing contract: a failed import answers 502 without detail.
  const payload = result.httpStatus === 502 ? { ok: false } : result.body;
  return NextResponse.json(payload, { status: result.httpStatus });
}
