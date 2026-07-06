import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { exportPatientArchive, type ArchiveExportResult } from "@/lib/archive-export";
import { PATIENT_INCLUDE, patientFromRow, patientLiteFromRow } from "@/lib/serialize";
import { ARCHIVE_OUTCOMES, DISORDER_CATEGORIES } from "@/lib/types";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "patient" && s.id !== params.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ patient: s.role === "admin" ? patientLiteFromRow(p) : patientFromRow(p) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || s.role === "patient") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const body = (await req.json()) as {
    action: string;
    therapistId?: string | null;
    text?: string;
    category?: string;
    email?: string;
    outcome?: string;
  };
  let archiveExport: ArchiveExportResult | undefined;
  if (body.action === "archive" || body.action === "unarchive") {
    // Concluding (or reopening) a treatment: the director or the patient's
    // assigned therapist only — needs the patient row for the assignment check.
    const patient = await prisma.patient.findUnique({ where: { id: params.id } });
    if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
    const allowed = s.role === "director" || (s.role === "therapist" && patient.therapistId === s.id);
    if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (body.action === "archive") {
      if (patient.status === "archived") return NextResponse.json({ error: "already archived" }, { status: 400 });
      const outcome =
        body.outcome && (ARCHIVE_OUTCOMES as readonly string[]).includes(body.outcome) ? body.outcome : null;
      await prisma.patient.update({
        where: { id: params.id },
        data: { status: "archived", archivedAt: new Date(), archiveOutcome: outcome, archivedBy: s.name },
      });
      // Best-effort filesystem export — the archive action itself succeeded;
      // a disk failure is reported to the client alongside the patient.
      archiveExport = await exportPatientArchive(prisma, params.id);
      if (!archiveExport.ok) console.error(`archive export failed for ${params.id}: ${archiveExport.error}`);
    } else {
      if (patient.status !== "archived") return NextResponse.json({ error: "not archived" }, { status: 400 });
      // Reopen: back to "therapy" if a diagnosis exists, else the intake phase.
      // Exported files stay on disk — deleting PII exports is a deliberate manual act.
      await prisma.patient.update({
        where: { id: params.id },
        data: {
          status: patient.diagnosisText ? "therapy" : "interview",
          archivedAt: null,
          archiveOutcome: null,
          archivedBy: null,
        },
      });
    }
  } else if (body.action === "assign") {
    // assignment is the administrator's job (the director can too)
    if (s.role !== "director" && s.role !== "admin")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await prisma.patient.update({ where: { id: params.id }, data: { therapistId: body.therapistId ?? null } });
  } else if (body.action === "diagnose") {
    if (s.role !== "director" && s.role !== "therapist")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const category = body.category && (DISORDER_CATEGORIES as readonly string[]).includes(body.category) ? body.category : null;
    await prisma.patient.update({
      where: { id: params.id },
      data: {
        diagnosisText: body.text,
        diagnosisDate: new Date(),
        diagnosisBy: s.name,
        disorderCategory: category,
        status: "therapy",
      },
    });
  } else if (body.action === "contact") {
    if (s.role !== "director" && s.role !== "therapist")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await prisma.patient.update({ where: { id: params.id }, data: { email: body.email || null } });
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({
    patient: s.role === "admin" ? patientLiteFromRow(p!) : patientFromRow(p!),
    ...(archiveExport ? { archiveExport } : {}),
  });
}
