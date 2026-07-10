// Application data model (shared by client and API).
import type { Lang } from "./i18n";
import type { InstrumentDef, RawAnswers } from "./instruments/types";

export type Role = "patient" | "therapist" | "director" | "admin";
export type PatientStatus = "assessment" | "interview" | "therapy";
export type SubmissionStatus = "sent" | "local" | "sending";

export const DISORDER_CATEGORIES = [
  "anxiety",
  "depression",
  "eating_disorder",
  "adhd",
  "burnout",
  "other",
] as const;
export type DisorderCategory = (typeof DISORDER_CATEGORIES)[number];

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
  channel: string; // "limesurvey" | "in_app"
  remindEveryDays: number | null;
  maxReminders: number | null;
  reminderCount: number;
  nextReminderAt: string | null;
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

/// One therapy-course document on the patient's timeline (file lives on disk,
/// served via /api/documents/[id]). docType values in src/lib/document-types.ts.
export interface DocumentRecord {
  id: string;
  docType: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  occurredAt: string;
  note: string;
  uploadedBy: { id: string; name: string } | null;
  createdAt: string;
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
  disorderCategory: string | null;
  therapistId: string | null;
  demographics: Demographics;
  responses: ResponseRecord[];
  invitations: InvitationRecord[];
  documents: DocumentRecord[];
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
  /// Whether the LimeSurvey connection is configured on the server — lets the
  /// UI disable e-mail invitation/reminder actions instead of surfacing 503s.
  limesurveyConfigured: boolean;
}

// --- shared helpers over the generic model ------------------------------------

export const DIPS_INSTRUMENT_ID = "dips_anxiety_intake";
/// The every-session process measure (Berner Patientenstundenbogen) and its
/// headline scale for dashboards. Scores run −3..+3.
export const SESSION_INSTRUMENT_ID = "pstb_adult";
export const SESSION_PRIMARY_SCALE = "Therapiefortschritte";

export function responsesFor(patient: Patient, instrumentId: string): ResponseRecord[] {
  return patient.responses.filter((r) => r.instrumentId === instrumentId);
}

/// The patient's session-questionnaire trajectory (the dashboard's primary metric).
export function sessionSeries(patient: Patient): ResponseRecord[] {
  return responsesFor(patient, SESSION_INSTRUMENT_ID)
    .filter((r) => r.sessionNumber !== null)
    .sort((a, b) => (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0));
}

export function latestSessionScore(patient: Patient): number | null {
  const series = sessionSeries(patient);
  const last = series[series.length - 1];
  const v = last?.scores[SESSION_PRIMARY_SCALE];
  return typeof v === "number" ? v : null;
}

export const fmtScore = (v: number) => (Math.round(v * 10) / 10).toString();

/// A clinical safety alert raised by a scale's `alert` rule on the patient's
/// LATEST response of that instrument (e.g. BDI-FS suicide item >= 1).
export interface ActiveAlert {
  instrumentId: string;
  instrumentAbbr: string;
  scaleKey: string;
  scaleLabel: string;
  value: number;
  occurredAt: string;
  message: string;
}

export function activeAlerts(patient: Patient, instruments: InstrumentDef[]): ActiveAlert[] {
  const alerts: ActiveAlert[] = [];
  for (const inst of instruments) {
    const flagged = inst.scales.filter((s) => s.alert);
    if (!flagged.length) continue;
    const responses = responsesFor(patient, inst.id);
    if (!responses.length) continue;
    const latest = responses[responses.length - 1]; // patient.responses is occurredAt-sorted
    for (const s of flagged) {
      const v = latest.scores[s.key];
      if (typeof v === "number" && v >= s.alert!.gte) {
        alerts.push({
          instrumentId: inst.id,
          instrumentAbbr: inst.abbreviation,
          scaleKey: s.key,
          scaleLabel: s.label,
          value: v,
          occurredAt: latest.occurredAt,
          message: s.alert!.message,
        });
      }
    }
  }
  return alerts;
}
