import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow, sessionLogFromRow } from "@/lib/serialize";
import { SESSION_LOG_TYPES } from "@/lib/types";

// Add a session-ledger entry: a held session (numbered; the client typically
// follows up with linked questionnaire invitations), a cancellation or a
// no-show (docs/outcome-prediction.md §4.5). Director or the patient's
// assigned therapist only.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || s.role === "patient" || s.role === "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed = s.role === "director" || (s.role === "therapist" && patient.therapistId === s.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (patient.status === "archived")
    return NextResponse.json({ error: "archived" }, { status: 400 });

  const body = (await req.json()) as {
    occurredAt?: string;
    type?: string;
    sessionNumber?: number | null;
    conductedById?: string | null;
    note?: string;
  };
  if (!body.type || !(SESSION_LOG_TYPES as readonly string[]).includes(body.type))
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime()))
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (body.sessionNumber != null && (!Number.isInteger(body.sessionNumber) || body.sessionNumber < 0))
    return NextResponse.json({ error: "invalid_session_number" }, { status: 400 });

  const created = await prisma.sessionLog.create({
    data: {
      patientId: params.id,
      occurredAt,
      type: body.type,
      // Only held sessions consume a number; cancellations/no-shows don't.
      sessionNumber: body.type === "held" ? (body.sessionNumber ?? null) : null,
      // Same convention as responses: default the conducting therapist from the
      // patient's current assignment when not explicitly chosen.
      conductedById: body.conductedById ?? patient.therapistId,
      note: body.note?.trim() ?? "",
    },
  });
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  // sessionLog is returned so the send step can link follow-up invitations.
  return NextResponse.json({ patient: patientFromRow(p!), sessionLog: sessionLogFromRow(created) });
}
