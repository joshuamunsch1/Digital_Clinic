import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { patientFromRow } from "@/lib/serialize";
import { toFHIR } from "@/lib/dips/fhir";
import { endpointLabel, relay } from "@/lib/server-dips";
import type { Demographics, DipsAnswers } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

// Submit a completed intake: store demographics, build + persist the FHIR
// QuestionnaireResponse, optionally relay it, advance status to "interview".
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { demo, dips } = (await req.json()) as {
    demo: Demographics;
    dips: { lang: Lang; answers: DipsAnswers; completedAt: string };
  };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  const fhir = toFHIR(
    { id: patient.id, name: patient.name, demographics: demo },
    { answers: dips.answers, lang: dips.lang, completedAt: dips.completedAt },
  );
  const r = await relay(fhir);

  const dipsData = {
    lang: dips.lang,
    completedAt: new Date(dips.completedAt),
    answers: JSON.stringify(dips.answers),
    fhir: JSON.stringify(fhir),
    submissionStatus: r.status,
    httpStatus: r.httpStatus ?? null,
    endpoint: endpointLabel(),
  };

  await prisma.patient.update({
    where: { id: params.id },
    data: {
      demographics: JSON.stringify(demo),
      assessmentDate: new Date(),
      status: "interview",
      dips: { upsert: { create: dipsData, update: dipsData } },
    },
  });

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: { entries: true, dips: true } });
  return NextResponse.json({ patient: patientFromRow(updated!) });
}

// Resend a stored submission to the FHIR relay.
export async function PUT(_req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sub = await prisma.dipsSubmission.findUnique({ where: { patientId: params.id } });
  if (!sub) return NextResponse.json({ error: "no submission" }, { status: 404 });
  const r = await relay(JSON.parse(sub.fhir));
  await prisma.dipsSubmission.update({
    where: { patientId: params.id },
    data: { submissionStatus: r.status, httpStatus: r.httpStatus ?? null },
  });
  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: { entries: true, dips: true } });
  return NextResponse.json({ patient: patientFromRow(updated!) });
}
