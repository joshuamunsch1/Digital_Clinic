import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { entryActor } from "@/lib/server-entry";

/// Undo a typing mistake: delete one of the caller's OWN manual entries within
/// 24 h of entering it (scale scores cascade). Older or foreign entries are
/// corrected by the treating therapist.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const actor = await entryActor(req);
  if ("res" in actor) return actor.res;
  const r = await prisma.responseInstance.findUnique({
    where: { id: params.id },
    select: { id: true, enteredById: true, createdAt: true, source: true },
  });
  if (!r || r.enteredById !== actor.s.id || r.source !== "manual_entry")
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (Date.now() - r.createdAt.getTime() >= 864e5)
    return NextResponse.json({ error: "delete_window_passed" }, { status: 400 });
  await prisma.responseInstance.delete({ where: { id: r.id } });
  return NextResponse.json({ ok: true });
}
