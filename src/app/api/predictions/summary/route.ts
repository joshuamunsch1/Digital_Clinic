import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { buildPredictionSummaries } from "@/lib/prediction/service";

// Compact per-patient badges for the dashboard (early change, on-track,
// dropout risk) computed in ONE pass over the caller's active patients —
// therapists get their own caseload, the director all active patients.
export async function GET(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "patient" || s.role === "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const patients = await prisma.patient.findMany({
    where: {
      status: { not: "archived" },
      ...(s.role === "therapist" ? { therapistId: s.id } : {}),
    },
    select: { id: true },
  });
  const summaries = await buildPredictionSummaries(prisma, patients.map((p) => p.id));
  return NextResponse.json({ summaries });
}
