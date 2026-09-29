// Standing per-patient measurement plan ("Messplan", Batch 16). Pure and
// client-safe: the plan editor, the session-log route and the background
// sweep share these rules.
//
// Why: sending the session questionnaires by hand after every appointment is
// the workload therapists said would make weekly measurement fail. The plan
// is set ONCE per patient (a default is created when the diagnosis starts
// therapy); afterwards
//   - rhythm "every_session" items go out automatically when a held session
//     is logged (no second click),
//   - rhythm "interval" items go out from the background sweep once
//     intervalDays have passed since the last request/response (no click),
//   - channel "paper" never dispatches — the item is shown as due so the
//     paper form can be handed out and entered (therapist or intern).
import { isOpenInvitation } from "./reminders";
import { populationMatches } from "./instruments/population";
import { hasFullWording, isFillable, type InstrumentDef } from "./instruments/types";
import { DIPS_INSTRUMENT_ID, type Patient, type PlanItemRecord } from "./types";

export const PLAN_RHYTHMS = ["every_session", "interval"] as const;
export const PLAN_CHANNELS = ["in_app", "limesurvey", "paper"] as const;
export type PlanRhythm = (typeof PLAN_RHYTHMS)[number];
export type PlanChannel = (typeof PLAN_CHANNELS)[number];
/// Interval choices offered in the editor (days): weekly … quarterly.
export const INTERVAL_PRESETS_DAYS = [7, 14, 28, 56, 91] as const;

const DAY_MS = 864e5;

/// Why a channel cannot carry an instrument (null = viable).
export type ChannelProblem = "not_fillable" | "no_wording" | "ls_unconfigured" | "ls_unlinked";

export function channelProblem(
  instrument: Pick<InstrumentDef, "instrumentType" | "definitionStatus" | "items" | "limesurveySurveyId">,
  channel: PlanChannel,
  limesurveyConfigured: boolean,
): ChannelProblem | null {
  if (instrument.instrumentType !== "likert_battery" || !isFillable(instrument)) return "not_fillable";
  if (channel === "in_app") return hasFullWording(instrument) ? null : "no_wording";
  if (channel === "limesurvey") {
    if (!limesurveyConfigured) return "ls_unconfigured";
    return instrument.limesurveySurveyId ? null : "ls_unlinked";
  }
  return null; // paper: any fillable battery can be entered manually
}

/// Preferred channel: in-app (no e-mail needed, completes itself), else
/// LimeSurvey when set up for the instrument, else paper.
export function defaultChannel(
  instrument: Pick<InstrumentDef, "instrumentType" | "definitionStatus" | "items" | "limesurveySurveyId">,
  limesurveyConfigured: boolean,
): PlanChannel {
  if (!channelProblem(instrument, "in_app", limesurveyConfigured)) return "in_app";
  if (!channelProblem(instrument, "limesurvey", limesurveyConfigured)) return "limesurvey";
  return "paper";
}

/// Instruments a plan may contain for this patient: fillable Likert batteries
/// in the patient's age band (DIPS and interviews excluded).
export function plannableInstruments(instruments: InstrumentDef[], patient: Patient): InstrumentDef[] {
  return instruments.filter(
    (i) =>
      i.id !== DIPS_INSTRUMENT_ID &&
      i.instrumentType === "likert_battery" &&
      isFillable(i) &&
      populationMatches(i, patient),
  );
}

export interface NewPlanItem {
  instrumentId: string;
  respondentRole: string;
  rhythm: PlanRhythm;
  intervalDays: number | null;
  channel: PlanChannel;
}

/// The default plan: every session-cadence instrument in the patient's age
/// band (PSTB or SBKJ-P, PHQ-4), each after every session.
export function defaultPlanItems(patient: Patient, instruments: InstrumentDef[], limesurveyConfigured: boolean): NewPlanItem[] {
  return plannableInstruments(instruments, patient)
    .filter((i) => i.cadenceType === "every_session")
    .map((i) => ({
      instrumentId: i.id,
      respondentRole: "self",
      rhythm: "every_session" as const,
      intervalDays: null,
      channel: defaultChannel(i, limesurveyConfigured),
    }));
}

/// Structural plan-item shape shared by client records and Prisma rows.
interface PlanLike {
  instrumentId: string;
  respondentRole: string;
  rhythm: PlanItemRecord["rhythm"] | string;
  intervalDays: number | null;
  channel: PlanItemRecord["channel"] | string;
  active: boolean;
}
interface InvitationLike {
  instrumentId: string;
  respondentRole: string;
  status: string;
  createdAt: string | Date;
}
interface ResponseLike {
  instrumentId: string;
  respondentRole: string;
  occurredAt: string | Date;
}

const ms = (d: string | Date) => (typeof d === "string" ? Date.parse(d) : d.getTime());

/// Most recent request or response for the item's instrument + rater. EVERY
/// request counts, whatever its status: a cancelled one was withdrawn on
/// purpose (no immediate re-send), and an errored one must not be recreated
/// by every sweep run — the error is visible in the panel, the next attempt
/// comes one interval later (or manually).
export function lastActivityAt(item: PlanLike, invitations: InvitationLike[], responses: ResponseLike[]): number | null {
  let last: number | null = null;
  const consider = (t: number) => {
    if (last === null || t > last) last = t;
  };
  for (const inv of invitations) {
    if (inv.instrumentId !== item.instrumentId || inv.respondentRole !== item.respondentRole) continue;
    consider(ms(inv.createdAt));
  }
  for (const r of responses) {
    if (r.instrumentId === item.instrumentId && r.respondentRole === item.respondentRole) consider(ms(r.occurredAt));
  }
  return last;
}

export function hasOpenRequest(item: PlanLike, invitations: InvitationLike[]): boolean {
  return invitations.some(
    (inv) => inv.instrumentId === item.instrumentId && inv.respondentRole === item.respondentRole && isOpenInvitation(inv.status),
  );
}

export interface IntervalStatus {
  /// When the next request is (or was) due; null = due now (never measured).
  dueAt: number | null;
  due: boolean;
  /// A request for this instrument is still open — nothing new goes out.
  waiting: boolean;
}

/// Interval-rhythm status of one item at `now`. Session-rhythm and inactive
/// items are never "due" here (they follow the session log).
export function intervalStatus(
  item: PlanLike,
  invitations: InvitationLike[],
  responses: ResponseLike[],
  now: Date,
): IntervalStatus {
  if (!item.active || item.rhythm !== "interval" || !item.intervalDays) return { dueAt: null, due: false, waiting: false };
  if (hasOpenRequest(item, invitations)) return { dueAt: null, due: false, waiting: true };
  const last = lastActivityAt(item, invitations, responses);
  if (last === null) return { dueAt: null, due: true, waiting: false };
  const dueAt = last + item.intervalDays * DAY_MS;
  return { dueAt, due: dueAt <= now.getTime(), waiting: false };
}

/// Interval items the sweep should send now (paper items excluded — they are
/// only shown as due).
export function dueIntervalItems<T extends PlanLike>(
  plan: T[],
  invitations: InvitationLike[],
  responses: ResponseLike[],
  now: Date,
): T[] {
  return plan.filter((item) => item.channel !== "paper" && intervalStatus(item, invitations, responses, now).due);
}

/// Session-rhythm items to send when a held session is logged.
export function sessionDispatchItems<T extends PlanLike>(plan: T[]): T[] {
  return plan.filter((item) => item.active && item.rhythm === "every_session" && item.channel !== "paper");
}
