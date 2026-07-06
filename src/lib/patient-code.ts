// Research pseudonyms (docs/outcome-prediction.md §4.4): every patient gets a
// stable "A00120"-style code at creation, used in exports instead of names.
// Sequential like the legacy convention; the unique constraint on Patient.code
// is the safety net against concurrent registrations.
import type { PrismaClient } from "@prisma/client";

const CODE_RE = /^A(\d{5})$/;

export function formatPatientCode(n: number): string {
  return `A${String(n).padStart(5, "0")}`;
}

async function highestCode(prisma: PrismaClient): Promise<number> {
  // SQLite lacks regex; codes are zero-padded to a fixed width, so the
  // lexicographic max IS the numeric max for well-formed codes.
  const row = await prisma.patient.findFirst({
    where: { code: { not: null } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const m = row?.code ? CODE_RE.exec(row.code) : null;
  return m ? parseInt(m[1], 10) : 0;
}

/// Allocate the next free code. `create` runs the actual insert; on a unique
/// violation (two simultaneous registrations drew the same code) we re-read
/// and retry once.
export async function withNextPatientCode<T>(
  prisma: PrismaClient,
  create: (code: string) => Promise<T>,
): Promise<T> {
  const code = formatPatientCode((await highestCode(prisma)) + 1);
  try {
    return await create(code);
  } catch (e) {
    const err = e as { code?: string; meta?: { target?: string[] | string } };
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(",") : String(err.meta?.target ?? "");
    const codeCollision = err.code === "P2002" && target.includes("code");
    if (!codeCollision) throw e;
    const retryCode = formatPatientCode((await highestCode(prisma)) + 1);
    return create(retryCode);
  }
}
