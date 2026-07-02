import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { limesurveyConfigured } from "@/lib/limesurvey";
import { staffNetworkGuard } from "@/lib/network";
import { syncInvitations } from "@/lib/server-invitations";

/// Poll LimeSurvey for completed responses across all open invitations
/// (optionally restricted to one patient via { patientId }). The reliable
/// safety net under the webhook/end-URL push — see docs/limesurvey-integration.md.
export async function POST(req: Request) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  if (!limesurveyConfigured())
    return NextResponse.json(
      { error: "LimeSurvey is not configured (set LIMESURVEY_URL / LIMESURVEY_USERNAME / LIMESURVEY_PASSWORD)" },
      { status: 503 },
    );
  const body = (await req.json().catch(() => ({}))) as { patientId?: string };
  const result = await syncInvitations(body.patientId);
  return NextResponse.json(result);
}
