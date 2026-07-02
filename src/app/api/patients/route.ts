import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { patientFromRow } from "@/lib/serialize";
import { PALETTE } from "@/lib/theme";

export async function POST(req: Request) {
  const s = getSession();
  if (!s || s.role !== "director") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { name } = (await req.json()) as { name: string };
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const count = await prisma.patient.count();
  const p = await prisma.patient.create({
    data: { name: name.trim(), color: PALETTE[count % PALETTE.length], status: "assessment", demographics: "{}" },
    include: { entries: true, dips: true },
  });
  return NextResponse.json({ patient: patientFromRow(p) });
}
