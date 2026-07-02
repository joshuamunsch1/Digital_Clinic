// Application data model (shared by client and API).
import type { Lang } from "./i18n";
import type { InstrumentDef, RawAnswers } from "./instruments/types";

export type Role = "patient" | "therapist" | "director";
export type PatientStatus = "assessment" | "interview" | "therapy";
export type SubmissionStatus = "sent" | "local" | "sending";

export interface SessionUser {
  role: Role;
  id: string;
  name: string;
}

export interface Demographics {
  age?: string | number;
  sex?: string;
  nationality?: string;
  city?: string;
  occupation?: string;
  living?: string;
  siblings?: string;
}

/// One filled-out questionnaire, with its computed scale scores.
export interface ResponseRecord {
  id: string;
  instrumentId: string;
  respondentRole: string;
  sessionNumber: number | null;
  wave: string | null;
  occurredAt: string;
  rawAnswers: RawAnswers;
  status: string;
  source: string;
  note: string;
  scores: Record<string, number>;
}

export interface InvitationContext {
  wave?: string;
  sessionNumber?: number;
}

export interface InvitationRecord {
  id: string;
  instrumentId: string;
  respondentRole: string;
  email: string;
  surveyId: string | null;
  token: string | null;
  url: string | null;
  status: string;
  context: InvitationContext;
  sentAt: string | null;
  remindedAt: string | null;
  completedAt: string | null;
  responseId: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface Diagnosis {
  text: string;
  date: string;
  by: string;
}

// DIPS answers are stored per module: answers[moduleId][key].
export type ModuleAnswers = Record<string, string | number | boolean | undefined>;
export type DipsAnswers = Record<string, ModuleAnswers>;

export interface SubmissionInfo {
  status: SubmissionStatus;
  endpoint: string;
  httpStatus?: number;
  at?: string;
}

export interface DipsRecord {
  lang: Lang;
  completedAt: string;
  answers: DipsAnswers;
  submission?: SubmissionInfo;
}

export interface Therapist {
  id: string;
  name: string;
  title: string;
}

export interface Patient {
  id: string;
  name: string;
  email: string | null;
  color: string;
  status: PatientStatus;
  therapistId: string | null;
  demographics: Demographics;
  responses: ResponseRecord[];
  invitations: InvitationRecord[];
  assessment: { date: string; type: string } | null;
  /// Convenience view of the DIPS intake response (if any) for the existing
  /// DIPS summary/FHIR UI. Derived from responses, not separately stored.
  dips: DipsRecord | null;
  diagnosis: Diagnosis | null;
}

export interface ClinicData {
  patients: Patient[];
  therapists: Therapist[];
  instruments: InstrumentDef[];
}

export interface RosterPatient { id: string; name: string; status: PatientStatus; }
export interface RosterUser { id: string; name: string; title: string; }
export interface LoginRoster {
  patients: RosterPatient[];
  therapists: RosterUser[];
  directors: RosterUser[];
}

// --- shared helpers over the generic model ------------------------------------

export const DIPS_INSTRUMENT_ID = "dips_anxiety_intake";
export const CHECKIN_INSTRUMENT_ID = "wellbeing_checkin";
export const CHECKIN_PRIMARY_SCALE = "wellbeing_index";

export function responsesFor(patient: Patient, instrumentId: string): ResponseRecord[] {
  return patient.responses.filter((r) => r.instrumentId === instrumentId);
}

/// The patient's session check-in trajectory (the dashboard's primary metric).
export function checkinSeries(patient: Patient): ResponseRecord[] {
  return responsesFor(patient, CHECKIN_INSTRUMENT_ID)
    .filter((r) => r.sessionNumber !== null)
    .sort((a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0));
}

export function latestCheckinIndex(patient: Patient): number | null {
  const series = checkinSeries(patient);
  const last = series[series.length - 1];
  const v = last?.scores[CHECKIN_PRIMARY_SCALE];
  return typeof v === "number" ? Math.round(v) : null;
}
