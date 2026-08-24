// Server-side helpers for the generic instrument model: load a definition from
// the database, score a raw submission with the shared engine, persist the
// response + denormalized ScaleScores.
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { instrumentFromRow } from "./serialize";
import { computeScaleScores } from "./instruments/scoring";
import { isScoreable, type InstrumentDef, type RawAnswers } from "./instruments/types";

export interface LoadedInstrument {
  def: InstrumentDef;
  scaleIds: Record<string, string>; // scale key -> Scale row id
}

export async function loadInstrument(instrumentId: string): Promise<LoadedInstrument | null> {
  const row = await prisma.instrument.findUnique({
    where: { id: instrumentId },
    include: { scales: true },
  });
  if (!row) return null;
  const scaleIds: Record<string, string> = {};
  for (const s of row.scales) scaleIds[s.key] = s.id;
  return { def: instrumentFromRow(row), scaleIds };
}

export interface NewResponse {
  patientId: string;
  respondentRole: string;
  rawAnswers: RawAnswers | Record<string, unknown>;
  occurredAt?: Date;
  sessionNumber?: number | null;
  wave?: string | null;
  note?: string;
  source?: string;
  meta?: Record<string, unknown>;
  /// Staff member who conducted/recorded this occasion (see schema.prisma).
  conductedById?: string | null;
}

/// Score (when the definition allows it) and persist one response.
export async function createResponse(inst: LoadedInstrument, r: NewResponse, db: PrismaClient = prisma) {
  const { def, scaleIds } = inst;
  let sessionNumber = r.sessionNumber ?? null;
  // every_session instruments auto-number their occasions when not supplied.
  // PATIENT-wide, not per-instrument: the old per-instrument counter let PSTB
  // and PHQ-4 drift apart permanently after one skipped questionnaire, and
  // every session-axis analytic keys on this number. Rules:
  //   1. another numbered response on the SAME calendar day (UTC) reuses that
  //      number — the "PSTB + PHQ-4 after the same session" case;
  //   2. otherwise max(known session number across ALL responses and held
  //      session-log entries) + 1 — a skipped instrument no longer desyncs
  //      the axes. First-ever measurement stays session 1 (0 = baseline,
  //      assigned explicitly via the monitoring flow).
  if (sessionNumber === null && def.cadenceType === "every_session") {
    const at = r.occurredAt ?? new Date();
    const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 864e5);
    const sameDay = await db.responseInstance.findFirst({
      where: {
        patientId: r.patientId,
        sessionNumber: { not: null },
        occurredAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { sessionNumber: "desc" },
    });
    if (sameDay?.sessionNumber != null) {
      sessionNumber = sameDay.sessionNumber;
    } else {
      const [lastResponse, lastLog] = await Promise.all([
        db.responseInstance.findFirst({
          where: { patientId: r.patientId, sessionNumber: { not: null } },
          orderBy: { sessionNumber: "desc" },
        }),
        db.sessionLog.findFirst({
          where: { patientId: r.patientId, type: "held", sessionNumber: { not: null } },
          orderBy: { sessionNumber: "desc" },
        }),
      ]);
      const max = Math.max(lastResponse?.sessionNumber ?? -1, lastLog?.sessionNumber ?? -1);
      sessionNumber = max < 0 ? 1 : max + 1;
    }
  }
  const scoring = isScoreable(def)
    ? computeScaleScores(def.items, def.scales, r.rawAnswers as RawAnswers)
    : { scores: {}, skipped: [] };
  const created = await db.responseInstance.create({
    data: {
      patientId: r.patientId,
      instrumentId: def.id,
      respondentRole: r.respondentRole,
      sessionNumber,
      wave: r.wave ?? null,
      conductedById: r.conductedById ?? null,
      occurredAt: r.occurredAt ?? new Date(),
      rawAnswers: JSON.stringify(r.rawAnswers),
      note: r.note ?? "",
      source: r.source ?? "in_app",
      meta: JSON.stringify(r.meta ?? {}),
      scaleScores: {
        create: Object.entries(scoring.scores).map(([key, value]) => ({ scaleId: scaleIds[key], value })),
      },
    },
  });
  return { response: created, skipped: scoring.skipped };
}

/// Keep only known item answers from an external row (LimeSurvey export / CSV),
/// applying the instrument's code->item mapping and coercing numerics.
export function extractRawAnswers(def: InstrumentDef, row: Record<string, unknown>): RawAnswers {
  const itemIds = new Set(def.items.map((i) => i.id));
  const mapping = def.limesurveyMapping ?? {};
  const answers: RawAnswers = {};
  for (const [key, value] of Object.entries(row)) {
    const itemId = mapping[key] ?? key;
    if (!itemIds.has(itemId)) continue;
    if (value === null || value === undefined || value === "") continue;
    const item = def.items.find((i) => i.id === itemId)!;
    if (item.responseType === "categorical" || item.responseType === "text") {
      answers[itemId] = String(value);
    } else {
      const n = Number(value);
      answers[itemId] = Number.isFinite(n) ? n : String(value);
    }
  }
  return answers;
}

/// Minimal CSV parser (quoted fields, comma or semicolon delimiter) for
/// LimeSurvey response exports. Returns one record per data row keyed by header.
export function parseCsv(text: string): Record<string, string>[] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = (r[i] ?? "").trim(); });
    return rec;
  });
}
