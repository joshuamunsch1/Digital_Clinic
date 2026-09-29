import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, instrumentFromRow, patientFromRow } from "@/lib/serialize";
import { therapistScoped } from "@/lib/access";
import { limesurveyConfigured } from "@/lib/limesurvey";
import { PLAN_CHANNELS, PLAN_RHYTHMS, channelProblem, plannableInstruments, type PlanChannel, type PlanRhythm } from "@/lib/measurement-plan";
import { ensureDefaultPlan } from "@/lib/server-plan";

const posInt = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max ? v : null;

/// Edit a patient's measurement plan ("Messplan", Batch 16). Director or the
/// assigned therapist. Actions:
///   add            { instrumentId, rhythm, intervalDays?, channel, remindEveryDays?, maxReminders? }
///   update         { itemId, rhythm?, intervalDays?, channel?, active?, remindEveryDays?, maxReminders? }
///   remove         { itemId }
///   applyDefaults  {} — the default plan, only when the plan is empty
/// Every write is validated against the instrument: the channel must be able
/// to carry it (in-app needs full item wording, LimeSurvey a linked survey),
/// and the instrument must fit the patient's age band.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const row = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!therapistScoped(s, row)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (row.status === "archived") return NextResponse.json({ error: "archived" }, { status: 400 });

  const body = (await req.json()) as {
    action?: string;
    itemId?: string;
    instrumentId?: string;
    rhythm?: string;
    intervalDays?: number | null;
    channel?: string;
    active?: boolean;
    remindEveryDays?: number | null;
    maxReminders?: number | null;
  };

  const done = async () => {
    const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
    return NextResponse.json({ patient: patientFromRow(updated!) });
  };

  if (body.action === "applyDefaults") {
    await ensureDefaultPlan(params.id);
    return done();
  }

  if (body.action === "remove") {
    const item = await prisma.measurementPlanItem.findUnique({ where: { id: body.itemId ?? "" } });
    if (!item || item.patientId !== params.id) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.measurementPlanItem.delete({ where: { id: item.id } });
    return done();
  }

  if (body.action !== "add" && body.action !== "update")
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });

  const existing =
    body.action === "update" ? await prisma.measurementPlanItem.findUnique({ where: { id: body.itemId ?? "" } }) : null;
  if (body.action === "update" && (!existing || existing.patientId !== params.id))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const instrumentId = existing?.instrumentId ?? body.instrumentId ?? "";
  const rhythm = (body.rhythm ?? existing?.rhythm) as PlanRhythm;
  const channel = (body.channel ?? existing?.channel) as PlanChannel;
  if (!(PLAN_RHYTHMS as readonly string[]).includes(rhythm))
    return NextResponse.json({ error: "invalid_rhythm" }, { status: 400 });
  if (!(PLAN_CHANNELS as readonly string[]).includes(channel))
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  const intervalDays =
    rhythm === "interval" ? posInt(body.intervalDays !== undefined ? body.intervalDays : existing?.intervalDays, 365) : null;
  if (rhythm === "interval" && intervalDays === null)
    return NextResponse.json({ error: "invalid_interval" }, { status: 400 });

  const instrumentRow = await prisma.instrument.findUnique({ where: { id: instrumentId }, include: { scales: true } });
  if (!instrumentRow) return NextResponse.json({ error: "unknown instrument" }, { status: 400 });
  const inst = instrumentFromRow(instrumentRow);
  if (!plannableInstruments([inst], patientFromRow(row)).length)
    return NextResponse.json({ error: "instrument_not_plannable" }, { status: 400 });
  const problem = channelProblem(inst, channel, limesurveyConfigured());
  if (problem) return NextResponse.json({ error: "channel_unavailable", problem }, { status: 400 });
  // In-app tasks live in the PATIENT's portal — self-report forms only.
  const respondentRole = channel === "in_app" ? "self" : inst.raterRole === "self" ? "self" : inst.raterRole;
  if (channel === "in_app" && inst.raterRole !== "self")
    return NextResponse.json({ error: "channel_unavailable", problem: "not_self_report" }, { status: 400 });

  const reminders = {
    remindEveryDays:
      body.remindEveryDays !== undefined ? posInt(body.remindEveryDays, 90) : (existing?.remindEveryDays ?? null),
    maxReminders: body.maxReminders !== undefined ? posInt(body.maxReminders, 10) : (existing?.maxReminders ?? null),
  };

  if (existing) {
    await prisma.measurementPlanItem.update({
      where: { id: existing.id },
      data: {
        rhythm,
        intervalDays,
        channel,
        respondentRole,
        active: typeof body.active === "boolean" ? body.active : existing.active,
        ...reminders,
      },
    });
    return done();
  }
  const duplicate = await prisma.measurementPlanItem.findUnique({
    where: { patientId_instrumentId_respondentRole: { patientId: params.id, instrumentId, respondentRole } },
  });
  if (duplicate) return NextResponse.json({ error: "already_planned" }, { status: 409 });
  await prisma.measurementPlanItem.create({
    data: { patientId: params.id, instrumentId, respondentRole, rhythm, intervalDays, channel, ...reminders },
  });
  return done();
}
