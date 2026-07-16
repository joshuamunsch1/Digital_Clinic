import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import type { GoalLevelKey, GoalLevels, GoalRating, SessionUser } from "@/lib/types";

// GAS therapy goals (Zielerreichungsskala nach Kiresuk & Sherman): staff-only
// create/update/rate/delete. Patients see their goals read-only via the clinic
// payload — there is no patient-facing write path.

const MAX_GOALS = 10;
const LEVEL_KEYS: readonly GoalLevelKey[] = ["-1", "0", "1", "2", "3"];

/// Whitelist-sanitize the per-level descriptions: only the five template level
/// keys survive, strings are trimmed and capped. Blank rungs are allowed (the
/// paper template leaves intermediate levels open).
function sanitizeLevels(input: unknown): GoalLevels {
  const out: GoalLevels = {};
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;
  for (const k of LEVEL_KEYS) {
    const v = obj[k];
    if (typeof v === "string") {
      const s = v.trim().slice(0, 500);
      if (s) out[k] = s;
    }
  }
  return out;
}

/// Shared auth + ownership preamble (same shape as the session-log route).
/// Returns the error response to send, or null to proceed.
async function guard(
  s: SessionUser | null,
  req: Request,
  patientId: string,
): Promise<NextResponse | null> {
  if (!s || s.role === "patient" || s.role === "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed = s.role === "director" || (s.role === "therapist" && patient.therapistId === s.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (patient.status === "archived")
    return NextResponse.json({ error: "archived" }, { status: 400 });
  return null;
}

async function respondWithPatient(patientId: string) {
  const p = await prisma.patient.findUnique({ where: { id: patientId }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(p!) });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  const denied = await guard(s, req, params.id);
  if (denied) return denied;

  const body = (await req.json()) as { title?: string; levels?: unknown };
  const title = (body.title ?? "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
  const count = await prisma.therapyGoal.count({ where: { patientId: params.id } });
  if (count >= MAX_GOALS)
    return NextResponse.json({ error: "too_many_goals" }, { status: 400 });

  await prisma.therapyGoal.create({
    data: {
      patientId: params.id,
      title,
      levels: JSON.stringify(sanitizeLevels(body.levels)),
    },
  });
  return respondWithPatient(params.id);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  const denied = await guard(s, req, params.id);
  if (denied) return denied;

  const body = (await req.json()) as {
    goalId?: string;
    action?: string;
    title?: string;
    levels?: unknown;
    level?: number;
    at?: string;
  };
  const goal = body.goalId
    ? await prisma.therapyGoal.findUnique({ where: { id: body.goalId } })
    : null;
  if (!goal || goal.patientId !== params.id)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "update") {
    const data: { title?: string; levels?: string } = {};
    if (body.title !== undefined) {
      const title = body.title.trim().slice(0, 200);
      if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
      data.title = title;
    }
    if (body.levels !== undefined) data.levels = JSON.stringify(sanitizeLevels(body.levels));
    await prisma.therapyGoal.update({ where: { id: goal.id }, data });
  } else if (body.action === "rate") {
    if (typeof body.level !== "number" || !Number.isInteger(body.level) || body.level < -1 || body.level > 3)
      return NextResponse.json({ error: "invalid_level" }, { status: 400 });
    const at = body.at ? new Date(body.at) : new Date();
    if (Number.isNaN(at.getTime()))
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    const ratings: GoalRating[] = JSON.parse(goal.ratings);
    ratings.push({ at: at.toISOString(), level: body.level, by: s!.name });
    ratings.sort((a, b) => a.at.localeCompare(b.at));
    await prisma.therapyGoal.update({ where: { id: goal.id }, data: { ratings: JSON.stringify(ratings) } });
  } else if (body.action === "removeRating") {
    const ratings: GoalRating[] = JSON.parse(goal.ratings);
    const idx = ratings.findIndex((r) => r.at === body.at);
    if (idx < 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    ratings.splice(idx, 1);
    await prisma.therapyGoal.update({ where: { id: goal.id }, data: { ratings: JSON.stringify(ratings) } });
  } else if (body.action === "delete") {
    await prisma.therapyGoal.delete({ where: { id: goal.id } });
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  return respondWithPatient(params.id);
}
