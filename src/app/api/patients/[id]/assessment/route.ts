import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PATIENT_INCLUDE, patientFromRow, type DipsMeta } from "@/lib/serialize";
import { createResponse, loadInstrument } from "@/lib/server-instruments";
import { toFHIR } from "@/lib/dips/fhir";
import { endpointLabel, relay } from "@/lib/server-dips";
import { DIPS_INSTRUMENT_ID, type Demographics, type DipsAnswers } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

// Submit a completed intake: store demographics, persist the interview as a
// ResponseInstance of the DIPS instrument (FHIR QuestionnaireResponse in meta),
// optionally relay it, advance status to "interview".
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { demo, dips } = (await req.json()) as {
    demo: Demographics;
    dips: { lang: Lang; answers: DipsAnswers; completedAt: string };
  };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  const inst = await loadInstrument(DIPS_INSTRUMENT_ID);
  if (!inst) return NextResponse.json({ error: "DIPS instrument is not seeded" }, { status: 500 });

  const fhir = toFHIR(
    { id: patient.id, name: patient.name, demographics: demo },
    { answers: dips.answers, lang: dips.lang, completedAt: dips.completedAt },
  );
  const r = await relay(fhir);
  const meta: DipsMeta = {
    lang: dips.lang,
    fhir,
    submission: { status: r.status, endpoint: endpointLabel(), httpStatus: r.httpStatus, at: dips.completedAt },
  };

  // intake_once: replace any previous intake rather than accumulating
  await prisma.responseInstance.deleteMany({ where: { patientId: params.id, instrumentId: DIPS_INSTRUMENT_ID } });
  await createResponse(inst, {
    patientId: params.id,
    respondentRole: "self",
    rawAnswers: dips.answers,
    occurredAt: new Date(dips.completedAt),
    meta: meta as unknown as Record<string, unknown>,
  });
  await prisma.patient.update({
    where: { id: params.id },
    data: { demographics: JSON.stringify(demo), assessmentDate: new Date(), status: "interview" },
  });

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(updated!) });
}

// Resend a stored submission to the FHIR relay.
export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
  return NextResponse.json({ patient: patientFromRow(updated!) });
}
