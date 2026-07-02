import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow, patientLiteFromRow } from "@/lib/serialize";
import { DISORDER_CATEGORIES } from "@/lib/types";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "patient" && s.id !== params.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ patient: s.role === "admin" ? patientLiteFromRow(p) : patientFromRow(p) });
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
  };
  if (body.action === "assign") {
    // assignment is the administrator's job (the director can too)
    if (s.role !== "director" && s.role !== "admin")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await prisma.patient.update({ where: { id: params.id }, data: { therapistId: body.therapistId ?? null } });
  } else if (body.action === "diagnose") {
    if (s.role !== "director" && s.role !== "therapist")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const category = body.category && (DISORDER_CATEGORIES as readonly string[]).includes(body.category) ? body.category : null;
    await prisma.patient.update({
      where: { id: params.id },
      data: {
        diagnosisText: body.text,
        diagnosisDate: new Date(),
        diagnosisBy: s.name,
        disorderCategory: category,
        status: "therapy",
      },
    });
  } else if (body.action === "contact") {
    if (s.role !== "director" && s.role !== "therapist")
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await prisma.patient.update({ where: { id: params.id }, data: { email: body.email || null } });
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const p = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: s.role === "admin" ? patientLiteFromRow(p!) : patientFromRow(p!) });
}
