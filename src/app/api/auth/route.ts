import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clearSession, getSession, setSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import type { Role, SessionUser } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ user: getSession() });
}

/// Login with e-mail + password. Staff (User) and patients share one login;
/// the role comes from the matched record, never from the client.
export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email?.trim() || !password)
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  const normalized = email.trim().toLowerCase();

  let user: SessionUser | null = null;
  const staff = await prisma.user.findUnique({ where: { email: normalized } });
  if (staff && verifyPassword(password, staff.passwordHash)) {
    user = { role: staff.role as Role, id: staff.id, name: staff.name };
  } else if (!staff) {
    const patient = await prisma.patient.findUnique({ where: { email: normalized } });
    if (patient && verifyPassword(password, patient.passwordHash)) {
      user = { role: "patient", id: patient.id, name: patient.name };
    }
  }
  // one generic error for unknown e-mail and wrong password alike
  if (!user) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  setSession(user);
  return NextResponse.json({ user });
}

export async function DELETE() {
  clearSession();
  return NextResponse.json({ ok: true });
}
