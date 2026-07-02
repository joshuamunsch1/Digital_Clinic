import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limesurveyConfigured } from "@/lib/limesurvey";
import { importCompletedInvitation } from "@/lib/server-invitations";

// Completion ping from LimeSurvey — either the survey's end-URL
// (…/api/limesurvey/notify?sid={SID}&token={TOKEN}) or a webhook plugin POST.
// Deliberately unauthenticated (the participant's browser hits it), so it
// discloses nothing and only triggers a server-to-server pull of a response
// that an open invitation is already expecting.
async function handle(sid: string | null, token: string | null) {
  if (!limesurveyConfigured()) return NextResponse.json({ ok: false, reason: "not configured" }, { status: 503 });
  if (!sid || !token) return NextResponse.json({ ok: false, reason: "missing sid/token" }, { status: 400 });
  const inv = await prisma.questionnaireInvitation.findFirst({
    where: { surveyId: sid, token, status: { in: ["invited", "reminded"] } },
  });
  if (!inv) return NextResponse.json({ ok: true, outcome: "no matching open invitation" });
  try {
    const outcome = await importCompletedInvitation(inv);
    return NextResponse.json({ ok: true, outcome });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return handle(url.searchParams.get("sid"), url.searchParams.get("token"));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sid = body.sid ?? body.surveyId ?? body.survey_id;
  const token = body.token;
  return handle(sid != null ? String(sid) : null, token != null ? String(token) : null);
}
