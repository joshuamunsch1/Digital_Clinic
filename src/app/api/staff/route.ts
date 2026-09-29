import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { hashPassword } from "@/lib/password";

// Director-only management of INTERN accounts (Praktikant:innen, Batch 16):
// list, create, deactivate/reactivate, reset password. Deliberately scoped to
// the intern role — therapist/director/admin accounts stay seed-managed.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function directorOnly(req: Request) {
  const s = getSession();
  if (!s || s.role !== "director") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return staffNetworkGuard(s, req);
}

async function listInterns() {
  const since = new Date(Date.now() - 30 * 864e5);
  const rows = await prisma.user.findMany({
    where: { role: "intern" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      createdAt: true,
      _count: { select: { entered: { where: { createdAt: { gte: since } } } } },
    },
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
    entries30d: u._count.entered,
  }));
}

export async function GET(req: Request) {
  const denied = await directorOnly(req);
  if (denied) return denied;
  return NextResponse.json({ interns: await listInterns() });
}

export async function POST(req: Request) {
  const denied = await directorOnly(req);
  if (denied) return denied;
  const body = (await req.json()) as { name?: string; email?: string; password?: string };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!name || !email || !password) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "weak_password" }, { status: 400 });
  // One login namespace for staff and patients (see api/auth).
  const [existingPatient, existingStaff] = await Promise.all([
    prisma.patient.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (existingPatient || existingStaff) return NextResponse.json({ error: "email_taken" }, { status: 409 });
  await prisma.user.create({
    data: { name, email, title: "Praktikant:in", role: "intern", passwordHash: hashPassword(password) },
  });
  return NextResponse.json({ interns: await listInterns() });
}

export async function PATCH(req: Request) {
  const denied = await directorOnly(req);
  if (denied) return denied;
  const body = (await req.json()) as { id?: string; active?: boolean; password?: string };
  const u = await prisma.user.findUnique({ where: { id: body.id ?? "" } });
  if (!u || u.role !== "intern") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (body.password !== undefined && body.password.length < 8)
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  await prisma.user.update({
    where: { id: u.id },
    data: {
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      ...(body.password ? { passwordHash: hashPassword(body.password) } : {}),
    },
  });
  return NextResponse.json({ interns: await listInterns() });
}
