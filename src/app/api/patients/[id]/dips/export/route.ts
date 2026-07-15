import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import type { DipsMeta } from "@/lib/serialize";
import { DIPS_INSTRUMENT_ID } from "@/lib/types";

/// Download the complete stored DIPS interview of one patient as a JSON
/// attachment: raw per-module answers, the FHIR payload and the relay status.
/// Triggered by a plain <a href> in the DiagnosisView (same pattern as the
/// research-export links on the dashboard).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, name: true },
  });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = await prisma.responseInstance.findFirst({
    where: { patientId: params.id, instrumentId: DIPS_INSTRUMENT_ID },
    orderBy: { occurredAt: "desc" },
  });
  if (!row) return NextResponse.json({ error: "no DIPS interview on file" }, { status: 404 });

  const meta = JSON.parse(row.meta) as DipsMeta;
  const conductedBy = row.conductedById
    ? await prisma.user.findUnique({ where: { id: row.conductedById }, select: { id: true, name: true } })
    : null;

  const payload = {
    exportedAt: new Date().toISOString(),
    patient: { id: patient.id, code: patient.code, name: patient.name },
    interview: {
      completedAt: row.occurredAt.toISOString(),
      respondentRole: row.respondentRole,
      conductedBy,
      lang: meta.lang ?? "de",
      answers: JSON.parse(row.rawAnswers),
    },
    fhir: meta.fhir ?? null,
    submission: meta.submission ?? null,
  };

  const stamp = row.occurredAt.toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dips-${patient.code ?? patient.id}-${stamp}.json"`,
    },
  });
}
