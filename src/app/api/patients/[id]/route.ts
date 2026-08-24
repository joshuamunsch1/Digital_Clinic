import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { exportPatientArchive, type ArchiveExportResult } from "@/lib/archive-export";
import { PATIENT_INCLUDE, patientForSession } from "@/lib/serialize";
import { therapistScoped } from "@/lib/access";
import {
  DIPS_INSTRUMENT_ID,
  DISORDER_CATEGORIES,
  EMPLOYMENT_STATUSES,
  PROBLEM_DURATIONS,
  TERMINATION_REASONS,
  type CaseCharacteristics,
  type Demographics,
} from "@/lib/types";

/// Loose ICD-10 shape ("F41.0", "F32"): letter + 2 digits + optional .1–2 digits.
const ICD_RE = /^[A-Z]\d{2}(\.\d{1,2})?$/;

/// Whitelist-validate a CaseCharacteristics patch — unknown keys and malformed
/// values are dropped, never stored (coded fields only, §4.3).
function sanitizeCaseCharacteristics(input: unknown): CaseCharacteristics {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out: CaseCharacteristics = {};
  if (typeof raw.problemDuration === "string" && (PROBLEM_DURATIONS as readonly string[]).includes(raw.problemDuration))
    out.problemDuration = raw.problemDuration as CaseCharacteristics["problemDuration"];
  if (typeof raw.priorPsychotherapy === "boolean") out.priorPsychotherapy = raw.priorPsychotherapy;
  if (typeof raw.psychotropicMedication === "boolean") out.psychotropicMedication = raw.psychotropicMedication;
  if (typeof raw.employment === "string" && (EMPLOYMENT_STATUSES as readonly string[]).includes(raw.employment))
    out.employment = raw.employment as CaseCharacteristics["employment"];
  if (typeof raw.treatmentExpectation === "number" && Number.isFinite(raw.treatmentExpectation))
    out.treatmentExpectation = Math.max(0, Math.min(10, Math.round(raw.treatmentExpectation)));
  return out;
}

/// Whitelist-validate a demographics patch — the same 7 fields the intake form
/// collects; unknown keys are dropped. Age may arrive as number or string.
function sanitizeDemographics(input: unknown): Demographics {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out: Demographics = {};
  if (typeof raw.age === "number" && Number.isFinite(raw.age)) out.age = raw.age;
  else if (typeof raw.age === "string" && raw.age.trim()) out.age = raw.age.trim();
  for (const key of ["sex", "nationality", "city", "occupation", "living", "siblings"] as const) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  }
  return out;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "patient" && s.id !== params.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Caseload scoping: a therapist reads only their own patients. (Writes were
  // always scoped; the read path relied on client-side list filtering.)
  if (s.role === "therapist" && !therapistScoped(s, p))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ patient: patientForSession(p, s.role) });
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
    terminationReason?: string;
    icdCode?: string;
    characteristics?: unknown;
    demographics?: unknown;
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
      // The coded end label is REQUIRED (docs/outcome-prediction.md §4.2): the
      // reference sample and dropout model depend on every episode being labeled.
      if (!body.terminationReason || !(TERMINATION_REASONS as readonly string[]).includes(body.terminationReason))
        return NextResponse.json({ error: "termination_reason_required" }, { status: 400 });
      const now = new Date();
      await prisma.patient.update({
        where: { id: params.id },
        data: {
          status: "archived",
          archivedAt: now,
          treatmentEndAt: now,
          terminationReason: body.terminationReason,
          archivedBy: s.name,
        },
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
          treatmentEndAt: null,
          terminationReason: null,
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
    const row = await prisma.patient.findUnique({ where: { id: params.id }, select: { therapistId: true } });
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!therapistScoped(s, row)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // The diagnosis PATCH sets date/author/status side effects — an empty text
    // must not slip through and produce a dated, authored, empty diagnosis.
    if (!body.text?.trim())
      return NextResponse.json({ error: "diagnosis_text_required" }, { status: 400 });
    const category = body.category && (DISORDER_CATEGORIES as readonly string[]).includes(body.category) ? body.category : null;
    const icdRaw = body.icdCode?.trim().toUpperCase() ?? "";
    if (icdRaw && !ICD_RE.test(icdRaw))
      return NextResponse.json({ error: "invalid_icd_code" }, { status: 400 });
    // Gate: the diagnosis is derived from / justified by the DIPS interview —
    // it must be conducted first (mirrors the UI gate in the diagnosis card).
    const dipsDone = await prisma.responseInstance.findFirst({
      where: { patientId: params.id, instrumentId: DIPS_INSTRUMENT_ID },
      select: { id: true },
    });
    if (!dipsDone) return NextResponse.json({ error: "dips_required" }, { status: 409 });
    const existing = await prisma.patient.findUnique({
      where: { id: params.id },
      select: { treatmentStartAt: true },
    });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.patient.update({
      where: { id: params.id },
      data: {
        diagnosisText: body.text.trim(),
        diagnosisDate: new Date(),
        diagnosisBy: s.name,
        disorderCategory: category,
        icdCode: icdRaw || null,
        status: "therapy",
        // Recording the diagnosis is what starts the therapy episode — keep the
        // first start date on re-diagnosis (episode label, not bookkeeping).
        ...(existing.treatmentStartAt ? {} : { treatmentStartAt: new Date() }),
      },
    });
  } else if (body.action === "caseCharacteristics") {
    // Structured intake predictors (§4.3) — merge-write so partial saves never
    // erase previously coded fields.
    if (s.role !== "director" && s.role !== "therapist")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const existing = await prisma.patient.findUnique({
      where: { id: params.id },
      select: { caseCharacteristics: true, therapistId: true },
    });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!therapistScoped(s, existing)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    let current: CaseCharacteristics = {};
    try {
      current = JSON.parse(existing.caseCharacteristics) as CaseCharacteristics;
    } catch {}
    const merged = { ...current, ...sanitizeCaseCharacteristics(body.characteristics) };
    await prisma.patient.update({
      where: { id: params.id },
      data: { caseCharacteristics: JSON.stringify(merged) },
    });
  } else if (body.action === "demographics") {
    // Staff correction/update of the intake demographics. Unlike the patient
    // assessment route this changes NOTHING besides the demographics JSON —
    // no status transition, no assessmentDate. Whole-document semantics on
    // purpose: IntakeEditView always submits the full 7-field form, and an
    // empty field means "cleared" (a merge would make clearing impossible).
    if (s.role !== "director" && s.role !== "therapist")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const row = await prisma.patient.findUnique({ where: { id: params.id }, select: { therapistId: true } });
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!therapistScoped(s, row)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await prisma.patient.update({
      where: { id: params.id },
      data: { demographics: JSON.stringify(sanitizeDemographics(body.demographics)) },
    });
  } else if (body.action === "contact") {
    if (s.role !== "director" && s.role !== "therapist")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const row = await prisma.patient.findUnique({ where: { id: params.id }, select: { therapistId: true } });
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!therapistScoped(s, row)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // Same patient+staff uniqueness check as registration and the monitoring
    // send-forms: a collision with a staff address would lock the patient out
    // of login entirely (staff match wins and the patient branch never runs).
    const email = body.email?.trim().toLowerCase() || null;
    if (email) {
      const [existingPatient, existingStaff] = await Promise.all([
        prisma.patient.findUnique({ where: { email } }),
        prisma.user.findUnique({ where: { email } }),
      ]);
      if ((existingPatient && existingPatient.id !== params.id) || existingStaff)
        return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    await prisma.patient.update({ where: { id: params.id }, data: { email } });
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({
    patient: patientForSession(p!, s.role),
    ...(archiveExport ? { archiveExport } : {}),
  });
}
