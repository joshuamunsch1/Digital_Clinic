import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { instrumentFromRow } from "@/lib/serialize";

export async function GET() {
  if (!getSession()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.instrument.findMany({ include: { scales: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ instruments: rows.map(instrumentFromRow) });
}
