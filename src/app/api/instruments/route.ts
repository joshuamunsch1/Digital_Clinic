import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { instrumentFromRow } from "@/lib/serialize";

export async function GET(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const rows = await prisma.instrument.findMany({ include: { scales: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ instruments: rows.map(instrumentFromRow) });
}
