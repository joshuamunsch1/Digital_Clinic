import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientForSession, type DipsMeta } from "@/lib/serialize";
import { relay, endpointLabel } from "@/lib/server-dips";
import { DIPS_INSTRUMENT_ID, type Demographics } from "@/lib/types";

// Submit a completed intake: demographics only (the DIPS interview is
// therapist-administered since the intake split — see POST .../dips).
// Advances status assessment → interview.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "patient" && s.id !== params.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const { demo } = (await req.json()) as { demo: Demographics };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.patient.update({
    where: { id: params.id },
    data: { demographics: JSON.stringify(demo), assessmentDate: new Date(), status: "interview" },
  });

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientForSession(updated!, s.role) });
}

// Resend a stored submission to the FHIR relay.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const row = await prisma.responseInstance.findFirst({
    where: { patientId: params.id, instrumentId: DIPS_INSTRUMENT_ID },
  });
  if (!row) return NextResponse.json({ error: "no submission" }, { status: 404 });
  const meta = JSON.parse(row.meta) as DipsMeta;
  if (!meta.fhir) return NextResponse.json({ error: "no stored FHIR payload" }, { status: 400 });
  const r = await relay(meta.fhir as Parameters<typeof relay>[0]);
  meta.submission = {
    status: r.status,
    endpoint: endpointLabel(),
    httpStatus: r.httpStatus,
    at: meta.submission?.at,
  };
  await prisma.responseInstance.update({ where: { id: row.id }, data: { meta: JSON.stringify(meta) } });
  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientForSession(updated!, s.role) });
}
