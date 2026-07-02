import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { patientFromRow } from "@/lib/serialize";

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [patients, therapists] = await Promise.all([
    prisma.patient.findMany({ include: { entries: true, dips: true }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { role: "therapist" }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({
    patients: patients.map(patientFromRow),
    therapists: therapists.map((t) => ({ id: t.id, name: t.name, title: t.title })),
  });
}
