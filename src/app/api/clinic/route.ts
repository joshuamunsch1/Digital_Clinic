import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, instrumentFromRow, patientFromRow, patientLiteFromRow } from "@/lib/serialize";

// Role-scoped clinic payload:
// - patient: only their own record (plus therapist names + instruments)
// - admin: all patients WITHOUT clinical data (no responses/scores/diagnosis)
// - therapist/director: everything (therapist filtering happens client-side)
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
      patients: me ? [patientFromRow(me)] : [],
      therapists: therapists.map((t) => ({ id: t.id, name: t.name, title: t.title })),
      instruments: instruments.map(instrumentFromRow),
    });
  }

  if (s.role === "admin") {
    const [patients, therapists] = await Promise.all([
      prisma.patient.findMany({ include: PATIENT_INCLUDE, orderBy: { createdAt: "asc" } }),
      therapistsQ,
    ]);
    return NextResponse.json({
      patients: patients.map(patientLiteFromRow),
      therapists: therapists.map((t) => ({ id: t.id, name: t.name, title: t.title })),
      instruments: [],
    });
  }

  const [patients, therapists, instruments] = await Promise.all([
    prisma.patient.findMany({ include: PATIENT_INCLUDE, orderBy: { createdAt: "asc" } }),
    therapistsQ,
    prisma.instrument.findMany({ include: { scales: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({
    patients: patients.map(patientFromRow),
    therapists: therapists.map((t) => ({ id: t.id, name: t.name, title: t.title })),
    instruments: instruments.map(instrumentFromRow),
  });
}
