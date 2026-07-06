import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { buildPrediction } from "@/lib/prediction/service";

// Therapist-facing decision support (docs/outcome-prediction.md): expected
// course, NN course + failure boundary, ETR, sudden shifts, early change,
// not-on-track, dropout risk. NEVER patient-facing — patients get 403 before
// anything is computed, and no prediction data flows through the patient
// serializers.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "patient" || s.role === "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { therapistId: true },
  });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed = s.role === "director" || (s.role === "therapist" && patient.therapistId === s.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const prediction = await buildPrediction(prisma, params.id);
  if (!prediction) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ prediction });
}
