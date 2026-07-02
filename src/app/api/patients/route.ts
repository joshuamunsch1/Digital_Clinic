import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { PALETTE } from "@/lib/theme";

// Manual registration by the clinic (patients normally self-register via /api/register).
export async function POST(req: Request) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const { name } = (await req.json()) as { name: string };
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const count = await prisma.patient.count();
  const p = await prisma.patient.create({
    data: { name: name.trim(), color: PALETTE[count % PALETTE.length], status: "assessment", demographics: "{}" },
    include: PATIENT_INCLUDE,
  });
  return NextResponse.json({ patient: patientFromRow(p) });
}
