import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow, patientLiteFromRow } from "@/lib/serialize";
import { PALETTE } from "@/lib/theme";
import { withNextPatientCode } from "@/lib/patient-code";
import type { Demographics } from "@/lib/types";

// Manual registration by the clinic (patients normally self-register via
// /api/register). Director/administrator can record e-mail and personal
// details right away; no password — the patient receives credentials later.
export async function POST(req: Request) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const body = (await req.json()) as { name?: string; email?: string; demographics?: Demographics };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const email = body.email?.trim().toLowerCase() || null;
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    const [existingPatient, existingStaff] = await Promise.all([
      prisma.patient.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    if (existingPatient || existingStaff)
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const count = await prisma.patient.count();
  const p = await withNextPatientCode(prisma, (code) =>
    prisma.patient.create({
      data: {
        name,
        email,
        code,
        color: PALETTE[count % PALETTE.length],
        status: "assessment",
        demographics: JSON.stringify(body.demographics ?? {}),
      },
      include: PATIENT_INCLUDE,
    }),
  );
  return NextResponse.json({ patient: s.role === "admin" ? patientLiteFromRow(p) : patientFromRow(p) });
}
