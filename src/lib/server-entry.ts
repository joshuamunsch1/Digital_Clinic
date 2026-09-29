// Code-keyed paper-questionnaire entry (Batch 16 — the intern / Praktikant:in
// workflow). Interns match paper forms to patients by research CODE only
// (A00123) and never see names, contact data, scores or diagnoses: every
// entry route answers with a receipt, never with the patient payload.
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { getSession } from "./auth";
import { staffNetworkGuard } from "./network";
import { populationMatches } from "./instruments/population";
import { isFillable } from "./instruments/types";
import { instrumentFromRow } from "./serialize";
import { suggestNextSessionNumber } from "./session-numbers";
import { DIPS_INSTRUMENT_ID, type InvitationContext, type Patient, type SessionUser } from "./types";

export const ENTRY_ROLES = ["intern", "director"] as const;
const CODE_RE = /^[A-Z]\d{5}$/;

export const normalizeCode = (raw: string | null | undefined) => (raw ?? "").trim().toUpperCase();
export const validCode = (code: string) => CODE_RE.test(code);

/// Session gate for the entry routes: intern or director, clinic network, and
/// — for interns — a still-ACTIVE account (a deactivated intern's open session
/// stops working immediately, not only at the next login).
export async function entryActor(req: Request): Promise<{ s: SessionUser } | { res: NextResponse }> {
  const s = getSession();
  if (!s) return { res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!(ENTRY_ROLES as readonly string[]).includes(s.role))
    return { res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return { res: restricted };
  if (s.role === "intern") {
    const u = await prisma.user.findUnique({ where: { id: s.id }, select: { active: true, role: true } });
    if (!u || !u.active || u.role !== "intern")
      return { res: NextResponse.json({ error: "account_inactive" }, { status: 403 }) };
  }
  return { s };
}

const parseJson = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/// Instruments that can be entered from paper for this patient: fillable Likert
/// batteries in the patient's age band (computed server-side so the patient's
/// age never leaves the server).
export async function entryInstruments(demographics: string) {
  const rows = await prisma.instrument.findMany({ include: { scales: true } });
  const patientLike = { demographics: parseJson(demographics, {}) } as unknown as Patient;
  return rows
    .map(instrumentFromRow)
    .filter(
      (i) =>
        i.id !== DIPS_INSTRUMENT_ID &&
        i.instrumentType === "likert_battery" &&
        isFillable(i) &&
        populationMatches(i, patientLike),
    );
}

export interface EntryTarget {
  code: string;
  status: string;
  therapistName: string | null;
  instrumentIds: string[];
  /// Recent entries of any source — dates/session numbers only, NO scores —
  /// so a paper form that is already in the system is not typed twice.
  recent: { instrumentId: string; occurredAt: string; sessionNumber: number | null; wave: string | null; respondentRole: string }[];
  /// Per every-session instrument: the latest held session still missing this
  /// instrument (the paper form just handed in), else the next number.
  suggestions: Record<string, { sessionNumber: number; date: string | null }>;
}

export async function lookupByCode(code: string): Promise<EntryTarget | null> {
  const p = await prisma.patient.findUnique({
    where: { code },
    select: {
      code: true,
      status: true,
      demographics: true,
      therapist: { select: { name: true } },
      sessionLogs: { select: { type: true, sessionNumber: true, occurredAt: true } },
      invitations: { select: { status: true, context: true } },
      responses: {
        select: { instrumentId: true, occurredAt: true, sessionNumber: true, wave: true, respondentRole: true },
        orderBy: { occurredAt: "desc" },
      },
    },
  });
  if (!p || !p.code) return null;
  const instruments = await entryInstruments(p.demographics);
  const responses = p.responses.filter((r) => r.instrumentId !== DIPS_INSTRUMENT_ID);
  const next = suggestNextSessionNumber({
    sessionLogs: p.sessionLogs,
    responses,
    invitations: p.invitations.map((i) => ({ status: i.status, context: parseJson<InvitationContext>(i.context, {}) })),
  });
  const heldDesc = p.sessionLogs
    .filter((l) => l.type === "held" && l.sessionNumber !== null)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const suggestions: EntryTarget["suggestions"] = {};
  for (const inst of instruments) {
    if (inst.cadenceType !== "every_session") continue;
    const measured = new Set(responses.filter((r) => r.instrumentId === inst.id).map((r) => r.sessionNumber));
    const open = heldDesc.find((l) => !measured.has(l.sessionNumber));
    suggestions[inst.id] = open
      ? { sessionNumber: open.sessionNumber!, date: open.occurredAt.toISOString().slice(0, 10) }
      : { sessionNumber: next, date: null };
  }
  return {
    code: p.code,
    status: p.status,
    therapistName: p.therapist?.name ?? null,
    instrumentIds: instruments.map((i) => i.id),
    recent: responses.slice(0, 15).map((r) => ({
      instrumentId: r.instrumentId,
      occurredAt: r.occurredAt.toISOString(),
      sessionNumber: r.sessionNumber,
      wave: r.wave,
      respondentRole: r.respondentRole,
    })),
    suggestions,
  };
}
