import { NextResponse } from "next/server";
import { entryActor, lookupByCode, normalizeCode, validCode } from "@/lib/server-entry";

/// Look up a patient by research code for paper-form entry (intern/director).
/// Returns assignment/entry context only — no name, e-mail, age, scores or
/// diagnosis (src/lib/server-entry.ts EntryTarget).
export async function GET(req: Request) {
  const actor = await entryActor(req);
  if ("res" in actor) return actor.res;
  const code = normalizeCode(new URL(req.url).searchParams.get("code"));
  if (!validCode(code)) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  const target = await lookupByCode(code);
  if (!target) return NextResponse.json({ error: "unknown_code" }, { status: 404 });
  return NextResponse.json({ target });
}
