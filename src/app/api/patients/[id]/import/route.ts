import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { createResponse, extractRawAnswers, loadInstrument, parseCsv } from "@/lib/server-instruments";
import { therapistScoped } from "@/lib/access";

/// Manual fallback for clinics without LimeSurvey API access: upload a
/// LimeSurvey CSV response export (headers = question codes) for one patient.
/// Every data row becomes one scored ResponseInstance.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const body = (await req.json()) as {
    instrumentId: string;
    csv: string;
    respondentRole?: string;
    wave?: string | null;
    sessionNumber?: number | null;
    occurredAt?: string;
  };
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (patient && !therapistScoped(s, patient)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  const inst = await loadInstrument(body.instrumentId);
  if (!inst) return NextResponse.json({ error: "unknown instrument" }, { status: 400 });
  if (!inst.def.items.length)
    return NextResponse.json(
      { error: `instrument '${inst.def.id}' has no verified item schema (definition ${inst.def.definitionStatus}) — imports cannot be interpreted yet` },
      { status: 400 },
    );

  const rows = parseCsv(body.csv ?? "");
  if (!rows.length) return NextResponse.json({ error: "no data rows found in CSV" }, { status: 400 });

  let imported = 0;
  const warnings: string[] = [];
  for (const [i, row] of rows.entries()) {
    const rawAnswers = extractRawAnswers(inst.def, row);
    if (!Object.keys(rawAnswers).length) {
      warnings.push(`row ${i + 1}: no columns matched the instrument's item ids — skipped`);
      continue;
    }
    const submit = row["submitdate"] ? new Date(row["submitdate"]) : null;
    const { skipped } = await createResponse(inst, {
      patientId: params.id,
      respondentRole: body.respondentRole ?? inst.def.raterRole,
      rawAnswers,
      occurredAt:
        submit && !Number.isNaN(submit.getTime())
          ? submit
          : body.occurredAt
            ? new Date(body.occurredAt)
            : new Date(),
      sessionNumber: body.sessionNumber,
      wave: body.wave,
      source: "csv_import",
    });
    imported++;
    for (const sk of skipped) warnings.push(`row ${i + 1}: scale ${sk.key} not computed (${sk.reason})`);
  }

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(updated!), imported, warnings });
}
