import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { patientFromRow } from "@/lib/serialize";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!getSession()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: { entries: true, dips: true } });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ patient: patientFromRow(p) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as { action: string; therapistId?: string | null; text?: string };
  if (body.action === "assign") {
    if (s.role !== "director") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await prisma.patient.update({ where: { id: params.id }, data: { therapistId: body.therapistId ?? null } });
  } else if (body.action === "diagnose") {
    await prisma.patient.update({
      where: { id: params.id },
      data: { diagnosisText: body.text, diagnosisDate: new Date(), diagnosisBy: s.name, status: "therapy" },
    });
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: { entries: true, dips: true } });
  return NextResponse.json({ patient: patientFromRow(p!) });
}
