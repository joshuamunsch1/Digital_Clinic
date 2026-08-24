import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow, type DipsMeta } from "@/lib/serialize";
import { createResponse, loadInstrument } from "@/lib/server-instruments";
import { toFHIR } from "@/lib/dips/fhir";
import { endpointLabel, relay } from "@/lib/server-dips";
import { therapistScoped } from "@/lib/access";
import { DIPS_INSTRUMENT_ID, type Demographics, type DipsAnswers } from "@/lib/types";
import type { Lang } from "@/lib/i18n";

const parseDemographics = (s: string): Demographics => {
  try {
    return JSON.parse(s) as Demographics;
  } catch {
    return {};
  }
};

/// Therapist-administered DIPS interview at the start of therapy. Staff-only:
/// the DIPS is a structured clinical interview, conducted with the patient and
/// recorded by the clinician (respondentRole "clinician", conductedById).
/// Replaces any previous DIPS (intake_once semantics). Accepted at any active
/// status — the demographics intake does NOT gate the interview. Completing it
/// during the assessment phase advances the patient to "interview"; confirming
/// the diagnosis remains what starts therapy.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const { dips } = (await req.json()) as {
    dips: { lang: Lang; answers: DipsAnswers; completedAt: string };
  };
  if (!dips?.answers) return NextResponse.json({ error: "missing dips answers" }, { status: 400 });

  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!therapistScoped(s, patient)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (patient.status === "archived")
    return NextResponse.json({ error: "archived" }, { status: 400 });

  const inst = await loadInstrument(DIPS_INSTRUMENT_ID);
  if (!inst) return NextResponse.json({ error: "DIPS instrument is not seeded" }, { status: 500 });

  const fhir = toFHIR(
    { id: patient.id, name: patient.name, demographics: parseDemographics(patient.demographics) },
    { answers: dips.answers, lang: dips.lang, completedAt: dips.completedAt },
  );
  const r = await relay(fhir);
  const meta: DipsMeta = {
    lang: dips.lang,
    fhir,
    submission: { status: r.status, endpoint: endpointLabel(), httpStatus: r.httpStatus, at: dips.completedAt },
  };

  // intake_once: replace any previous DIPS rather than accumulating
  await prisma.responseInstance.deleteMany({ where: { patientId: params.id, instrumentId: DIPS_INSTRUMENT_ID } });
  await createResponse(inst, {
    patientId: params.id,
    respondentRole: "clinician",
    conductedById: s.id,
    rawAnswers: dips.answers,
    occurredAt: new Date(dips.completedAt),
    meta: meta as unknown as Record<string, unknown>,
  });
  if (patient.status === "assessment")
    await prisma.patient.update({ where: { id: params.id }, data: { status: "interview" } });

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(updated!) });
}
