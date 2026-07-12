import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { withNextPatientCode } from "@/lib/patient-code";
import { PALETTE } from "@/lib/theme";
import type { Demographics, SessionUser } from "@/lib/types";

// Public patient self-registration (reachable from any network — only staff
// data access is network-restricted, see src/lib/network.ts). New patients
// start unassigned in status "assessment" and appear in the director's /
// administrator's "new registrations" list.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    email?: string;
    password?: string;
    demographics?: Demographics;
  };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!name || !email || !password)
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "weak_password" }, { status: 400 });

  const [existingPatient, existingStaff] = await Promise.all([
    prisma.patient.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (existingPatient || existingStaff)
    return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const count = await prisma.patient.count();
  const patient = await withNextPatientCode(prisma, (code) =>
    prisma.patient.create({
      data: {
        name,
        email,
        code,
        passwordHash: hashPassword(password),
        color: PALETTE[count % PALETTE.length],
        status: "assessment",
        demographics: JSON.stringify(body.demographics ?? {}),
      },
    }),
  );

  const user: SessionUser = { role: "patient", id: patient.id, name: patient.name };
  setSession(user);
  return NextResponse.json({ user });
}
