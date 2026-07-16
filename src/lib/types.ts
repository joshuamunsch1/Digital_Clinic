// Application data model (shared by client and API).
import type { Lang } from "./i18n";
import type { InstrumentDef, RawAnswers } from "./instruments/types";

export type Role = "patient" | "therapist" | "director" | "admin";
export type PatientStatus = "assessment" | "interview" | "therapy" | "archived";
export type SubmissionStatus = "sent" | "local" | "sending";

/// Coded treatment-end labels recorded when a patient is archived
/// (docs/outcome-prediction.md §4.2). "dropout" is therapist judgment — the
/// concluding clinician picks the code, there is no automatic session-count rule
/// (clinic decision on §6.2).
export const TERMINATION_REASONS = ["completed", "dropout", "mutual", "transfer", "other"] as const;
export type TerminationReason = (typeof TERMINATION_REASONS)[number];

/// Coded intake predictors (docs/outcome-prediction.md §4.3 — the classic ETR
/// set). Coded fields only, never free text; stored as JSON on
/// Patient.caseCharacteristics.
export const PROBLEM_DURATIONS = ["lt6m", "m6to24", "gt24m"] as const;
export type ProblemDuration = (typeof PROBLEM_DURATIONS)[number];
export const EMPLOYMENT_STATUSES = ["employed", "in_training", "unemployed", "retired", "other"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export interface CaseCharacteristics {
  /// Chronicity of the presenting problem (ordinal: <6 months / 6–24 / >24).
  problemDuration?: ProblemDuration;
  priorPsychotherapy?: boolean;
  psychotropicMedication?: boolean;
  employment?: EmploymentStatus;
  /// Patient-rated treatment expectation, integer 0–10.
  treatmentExpectation?: number;
}

/// Sessions without a questionnaire (docs/outcome-prediction.md §4.5):
/// held-but-unmeasured, cancellations, no-shows. Measured sessions live in
/// ResponseInstance — dose–response analyses join both.
export const SESSION_LOG_TYPES = ["held", "cancelled", "no_show"] as const;
export type SessionLogType = (typeof SESSION_LOG_TYPES)[number];

export interface SessionLogRecord {
  id: string;
  occurredAt: string;
  type: string;
  conductedById: string | null;
  note: string;
}

/// Goal Attainment Scaling (Zielerreichungsskala nach Kiresuk & Sherman — the
/// clinic's paper template): per goal a title plus free-text descriptions of
/// five attainment levels, and a series of dated therapist ratings.
/// GAS_LEVELS is the ladder display order (+3 on top … −1 at the bottom);
/// 0 is the Ausgangslage/Ist-Zustand baseline.
export const GAS_LEVELS = [3, 2, 1, 0, -1] as const;
export type GasLevel = (typeof GAS_LEVELS)[number];
export type GoalLevelKey = "-1" | "0" | "1" | "2" | "3";
export type GoalLevels = Partial<Record<GoalLevelKey, string>>;

export interface GoalRating {
  at: string;
  level: number;
  /// Staff display name at rating time (mirrors diagnosisBy/archivedBy).
  by: string;
}

export interface GoalRecord {
  id: string;
  title: string;
  levels: GoalLevels;
  /// Kept date-sorted by the API; last entry = current attainment.
  ratings: GoalRating[];
  createdAt: string;
}

/// The most recent attainment rating of a goal, or null if unrated.
export function currentGoalRating(g: GoalRecord): GoalRating | null {
  return g.ratings.length ? g.ratings[g.ratings.length - 1] : null;
}

/// Who can fill out an instrument — shared by the clinician entry forms.
export const RATER_ROLES = ["self", "mother", "father", "parent", "teacher", "caregiver", "clinician"] as const;

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
  /// Staff member who conducted/recorded this occasion, if any (see schema.prisma).
  conductedById: string | null;
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
  /// "clinician" for the therapist-administered interview; "self" on legacy
  /// patient-intake records.
  respondentRole?: string;
  conductedById?: string | null;
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
  /// Research pseudonym ("A00120"-style) — used in exports instead of the name.
  code: string | null;
  icdCode: string | null;
  /// Treatment episode boundaries + coded end label (docs/outcome-prediction.md §4.2).
  treatmentStartAt: string | null;
  treatmentEndAt: string | null;
  terminationReason: string | null;
  caseCharacteristics: CaseCharacteristics;
  /// Synthetic patient from src/lib/simulation/ (stand-in reference sample).
  simulated: boolean;
  /// Set when the treatment was concluded (status === "archived").
  archivedAt: string | null;
  archivedBy: string | null;
  demographics: Demographics;
  responses: ResponseRecord[];
  invitations: InvitationRecord[];
  documents: DocumentRecord[];
  sessionLogs: SessionLogRecord[];
  /// GAS therapy goals — staff-entered, patient-visible read-only.
  goals: GoalRecord[];
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
