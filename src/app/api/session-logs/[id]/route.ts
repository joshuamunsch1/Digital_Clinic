import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";

// Delete a mis-entered session-log row (corrections only — measured sessions
// are ResponseInstances and are not deletable here).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || s.role === "patient" || s.role === "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const log = await prisma.sessionLog.findUnique({
    where: { id: params.id },
    include: { patient: { select: { id: true, therapistId: true } } },
  });
  if (!log) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed = s.role === "director" || (s.role === "therapist" && log.patient.therapistId === s.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.sessionLog.delete({ where: { id: params.id } });
  const p = await prisma.patient.findUnique({ where: { id: log.patient.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(p!) });
}
