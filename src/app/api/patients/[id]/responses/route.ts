import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientForSession } from "@/lib/serialize";
import { createResponse, loadInstrument } from "@/lib/server-instruments";
import { isFillable, type RawAnswers } from "@/lib/instruments/types";

/// Submit one filled-out questionnaire (patient in-app, or therapist manual entry).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // patients can only submit for themselves (and may do so from any network);
  // staff manual entry requires the clinic network
  if (s.role === "patient" && s.id !== params.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (s.role === "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const body = (await req.json()) as {
    instrumentId: string;
    rawAnswers: RawAnswers;
    respondentRole?: string;
    sessionNumber?: number | null;
    wave?: string | null;
    occurredAt?: string;
    note?: string;
  };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  const inst = await loadInstrument(body.instrumentId);
  if (!inst) return NextResponse.json({ error: "unknown instrument" }, { status: 400 });
  if (!isFillable(inst.def) || inst.def.instrumentType === "structured_interview")
    return NextResponse.json(
      { error: `instrument '${inst.def.id}' cannot be submitted through the generic form (definition ${inst.def.definitionStatus})` },
      { status: 400 },
    );

  const { skipped } = await createResponse(inst, {
    patientId: params.id,
    respondentRole: body.respondentRole ?? "self",
    rawAnswers: body.rawAnswers,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    sessionNumber: body.sessionNumber,
    wave: body.wave,
    note: body.note,
    source: s.role === "patient" ? "in_app" : "manual_entry",
  });

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientForSession(updated!, s.role), skippedScales: skipped });
}
