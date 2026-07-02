// Application data model (shared by client and API).
import type { Lang } from "./i18n";
import type { Scores } from "./wellbeing";

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

export interface WellbeingEntry {
  session: number;
  type: "baseline" | "session";
  date: string;
  scores: Scores;
  note: string;
}

export interface Diagnosis {
  text: string;
  date: string;
  by: string;
}

// Answers are stored per module: answers[moduleId][key].
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
  color: string;
  status: PatientStatus;
  therapistId: string | null;
  demographics: Demographics;
  entries: WellbeingEntry[];
  assessment: { date: string; type: string } | null;
  dips: DipsRecord | null;
  diagnosis: Diagnosis | null;
}

export interface ClinicData {
  patients: Patient[];
  therapists: Therapist[];
}

export interface RosterPatient { id: string; name: string; status: PatientStatus; }
export interface RosterUser { id: string; name: string; title: string; }
export interface LoginRoster {
  patients: RosterPatient[];
  therapists: RosterUser[];
  directors: RosterUser[];
}