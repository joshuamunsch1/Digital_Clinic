import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedClinic } from "@/lib/seed-clinic";

// Dev/demo convenience: wipe and reseed. Disabled in production.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const counts = await seedClinic(prisma);
  return NextResponse.json({ ok: true, counts });
}
