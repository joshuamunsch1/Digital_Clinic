import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, instrumentFromRow, patientForSession, patientFromRow, patientLiteFromRow, patientSummaryFromRow } from "@/lib/serialize";
import { limesurveyConfigured } from "@/lib/limesurvey";

// Role-scoped clinic payload:
// - patient: only their own record (plus therapist names + instruments)
// - admin: all patients WITHOUT clinical data (no responses/scores/diagnosis)
// - director: all active patients in full; ARCHIVED patients as summary rows
//   without response payloads (the reference archive can hold hundreds of
//   cases — PatientDetail fetches the full dossier on open)
// - therapist: ONLY their own caseload (active full + own archived summaries).
//   The UI always filtered to the own caseload; the payload now matches, so a
//   therapist can no longer read colleagues' dossiers over the API.
export async function GET(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const therapistsQ = prisma.user.findMany({ where: { role: "therapist" }, orderBy: { name: "asc" } });

  if (s.role === "patient") {
    const [me, therapists, instruments] = await Promise.all([
      prisma.patient.findUnique({ where: { id: s.id }, include: PATIENT_INCLUDE }),
      therapistsQ,
      prisma.instrument.findMany({ include: { scales: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({
      patients: me ? [patientForSession(me, s.role)] : [],
      therapists: therapists.map((t) => ({ id: t.id, name: t.name, title: t.title })),
      instruments: instruments.map(instrumentFromRow),
      limesurveyConfigured: limesurveyConfigured(),
    });
  }

  if (s.role === "admin") {
    const [patients, therapists] = await Promise.all([
      prisma.patient.findMany({ orderBy: { createdAt: "asc" } }),
      therapistsQ,
    ]);
    return NextResponse.json({
      patients: patients.map((p) => patientLiteFromRow({ ...p, responses: [], invitations: [], sessionLogs: [], goals: [] })),
      therapists: therapists.map((t) => ({ id: t.id, name: t.name, title: t.title })),
      instruments: [],
      limesurveyConfigured: limesurveyConfigured(),
    });
  }

  const caseload = s.role === "therapist" ? { therapistId: s.id } : {};
  const [active, archived, therapists, instruments] = await Promise.all([
    prisma.patient.findMany({
      where: { status: { not: "archived" }, ...caseload },
      include: PATIENT_INCLUDE,
      orderBy: { createdAt: "asc" },
    }),
    prisma.patient.findMany({ where: { status: "archived", ...caseload }, orderBy: { createdAt: "asc" } }),
    therapistsQ,
    prisma.instrument.findMany({ include: { scales: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({
    patients: [...active.map(patientFromRow), ...archived.map(patientSummaryFromRow)],
    therapists: therapists.map((t) => ({ id: t.id, name: t.name, title: t.title })),
    instruments: instruments.map(instrumentFromRow),
    limesurveyConfigured: limesurveyConfigured(),
  });
}
