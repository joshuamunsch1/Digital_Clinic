import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { instrumentFromRow } from "@/lib/serialize";

/// Link an instrument to its LimeSurvey survey (id + optional code->item mapping).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const body = (await req.json()) as { limesurveySurveyId?: string | null; limesurveyMapping?: Record<string, string> };
  const row = await prisma.instrument.update({
    where: { id: params.id },
    data: {
      ...(body.limesurveySurveyId !== undefined ? { limesurveySurveyId: body.limesurveySurveyId || null } : {}),
      ...(body.limesurveyMapping !== undefined ? { limesurveyMapping: JSON.stringify(body.limesurveyMapping) } : {}),
    },
    include: { scales: true },
  });
  return NextResponse.json({ instrument: instrumentFromRow(row) });
}
