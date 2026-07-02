import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { patientFromRow } from "@/lib/serialize";
import type { Scores } from "@/lib/wellbeing";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { scores, note } = (await req.json()) as { scores: Scores; note?: string };
  const lastEntry = await prisma.wellbeingEntry.findFirst({
    where: { patientId: params.id },
    orderBy: { session: "desc" },
  });
  const nextSession = lastEntry ? lastEntry.session + 1 : 1;
  await prisma.wellbeingEntry.create({
    data: {
      patientId: params.id,
      session: nextSession,
      type: "session",
      date: new Date(),
      scores: JSON.stringify(scores),
      note: note || "",
    },
  });
  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: { entries: true, dips: true } });
  return NextResponse.json({ patient: patientFromRow(updated!) });
}
