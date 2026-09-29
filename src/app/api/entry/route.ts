import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createResponse, loadInstrument } from "@/lib/server-instruments";
import { validateRawAnswers } from "@/lib/instruments/validate";
import type { RawAnswers } from "@/lib/instruments/types";
import { entryActor, entryInstruments, normalizeCode, validCode } from "@/lib/server-entry";

const DAY_MS = 864e5;
const DELETE_WINDOW_MS = DAY_MS; // own entries stay correctable for 24 h

/// Enter one paper questionnaire by patient CODE (intern/director, Batch 16).
/// Validated like any manual entry; stored as source "manual_entry" with the
/// patient's therapist as conducting clinician and the typist as enteredBy.
/// A probable double entry (same code + instrument + rater on the same day or
/// with the same session number) is refused with 409 duplicate_entry unless
/// confirmDuplicate is set. Answers with a RECEIPT, never the dossier.
export async function POST(req: Request) {
  const actor = await entryActor(req);
  if ("res" in actor) return actor.res;
  const { s } = actor;

  const body = (await req.json()) as {
    code?: string;
    instrumentId?: string;
    rawAnswers?: RawAnswers;
    occurredAt?: string;
    sessionNumber?: number | null;
    wave?: string | null;
    respondentRole?: string;
    note?: string;
    confirmDuplicate?: boolean;
  };
  const code = normalizeCode(body.code);
  if (!validCode(code)) return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  const patient = await prisma.patient.findUnique({
    where: { code },
    select: { id: true, code: true, status: true, therapistId: true, demographics: true },
  });
  if (!patient) return NextResponse.json({ error: "unknown_code" }, { status: 404 });
  if (patient.status === "archived") return NextResponse.json({ error: "archived" }, { status: 400 });

  const allowed = await entryInstruments(patient.demographics);
  const inst = await loadInstrument(body.instrumentId ?? "");
  if (!inst || !allowed.some((i) => i.id === inst.def.id))
    return NextResponse.json({ error: "instrument_not_enterable" }, { status: 400 });
  const validation = validateRawAnswers(inst.def, body.rawAnswers ?? {});
  if (!validation.ok)
    return NextResponse.json({ error: "invalid_answers", problems: validation.problems }, { status: 400 });

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime()))
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (occurredAt.getTime() > Date.now() + DAY_MS) return NextResponse.json({ error: "future_date" }, { status: 400 });

  const everySession = inst.def.cadenceType === "every_session";
  const sessionNumber =
    everySession && typeof body.sessionNumber === "number" && Number.isInteger(body.sessionNumber) && body.sessionNumber >= 0
      ? body.sessionNumber
      : null;
  const waves = inst.def.cadenceConfig.waves ?? ["pre", "zm", "post", "postF"];
  const wave = inst.def.cadenceType === "wave" && body.wave && waves.includes(body.wave) ? body.wave : null;
  const respondentRole =
    typeof body.respondentRole === "string" && /^[a-z_]{2,20}$/.test(body.respondentRole) ? body.respondentRole : "self";

  if (!body.confirmDuplicate) {
    const dayStart = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate()));
    const duplicate = await prisma.responseInstance.findFirst({
      where: {
        patientId: patient.id,
        instrumentId: inst.def.id,
        respondentRole,
        OR: [
          { occurredAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) } },
          ...(sessionNumber !== null ? [{ sessionNumber }] : []),
        ],
      },
      select: { occurredAt: true, sessionNumber: true },
    });
    if (duplicate)
      return NextResponse.json(
        {
          error: "duplicate_entry",
          existing: { occurredAt: duplicate.occurredAt.toISOString(), sessionNumber: duplicate.sessionNumber },
        },
        { status: 409 },
      );
  }

  const { response, skipped } = await createResponse(inst, {
    patientId: patient.id,
    respondentRole,
    rawAnswers: body.rawAnswers ?? {},
    occurredAt,
    sessionNumber,
    wave,
    note: body.note?.trim() || undefined,
    conductedById: patient.therapistId,
    enteredById: s.id,
    source: "manual_entry",
  });
  return NextResponse.json({
    entry: {
      id: response.id,
      code,
      instrumentId: inst.def.id,
      occurredAt: response.occurredAt.toISOString(),
      sessionNumber: response.sessionNumber,
      wave: response.wave,
      respondentRole,
      createdAt: response.createdAt.toISOString(),
      deletable: true,
    },
    skippedScales: skipped.map((k) => k.key),
  });
}

/// The caller's own entries of the last 30 days (receipt fields + code only).
export async function GET(req: Request) {
  const actor = await entryActor(req);
  if ("res" in actor) return actor.res;
  const since = new Date(Date.now() - 30 * DAY_MS);
  const rows = await prisma.responseInstance.findMany({
    where: { enteredById: actor.s.id, createdAt: { gte: since } },
    select: {
      id: true,
      instrumentId: true,
      occurredAt: true,
      sessionNumber: true,
      wave: true,
      respondentRole: true,
      createdAt: true,
      patient: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const now = Date.now();
  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      code: r.patient.code ?? "—",
      instrumentId: r.instrumentId,
      occurredAt: r.occurredAt.toISOString(),
      sessionNumber: r.sessionNumber,
      wave: r.wave,
      respondentRole: r.respondentRole,
      createdAt: r.createdAt.toISOString(),
      deletable: now - r.createdAt.getTime() < DELETE_WINDOW_MS,
    })),
  });
}
