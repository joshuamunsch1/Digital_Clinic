import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clearSession, getSession, setSession } from "@/lib/auth";
import type { Role, SessionUser } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ user: getSession() });
}

export async function POST(req: Request) {
  const { role, id } = (await req.json()) as { role: Role; id: string };
  let name = "";
  if (role === "patient") {
    const p = await prisma.patient.findUnique({ where: { id } });
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    name = p.name;
  } else {
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u || u.role !== role) return NextResponse.json({ error: "not found" }, { status: 404 });
    name = u.name;
  }
  const user: SessionUser = { role, id, name };
  setSession(user);
  return NextResponse.json({ user });
}

export async function DELETE() {
  clearSession();
  return NextResponse.json({ ok: true });
}
