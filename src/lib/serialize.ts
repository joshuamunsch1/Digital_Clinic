// Map database rows (JSON stored as TEXT) to the application data model.
import type {
  Demographics,
  DipsAnswers,
  DipsRecord,
  Patient,
  SubmissionInfo,
  WellbeingEntry,
} from "./types";
import type { Lang } from "./i18n";
import type { Scores } from "./wellbeing";

interface EntryRow {
  session: number;
  type: string;
  date: Date;
  scores: string;
  note: string;
}
interface DipsRow {
  lang: string;
  completedAt: Date;
  answers: string;
  submissionStatus: string;
  httpStatus: number | null;
  endpoint: string;
}
interface PatientRow {
  id: string;
  name: string;
  color: string;
  status: string;
  therapistId: string | null;
  demographics: string;
  assessmentDate: Date | null;
  diagnosisText: string | null;
  diagnosisDate: Date | null;
  diagnosisBy: string | null;
  entries: EntryRow[];
  dips: DipsRow | null;
}

const parse = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function entryFromRow(e: EntryRow): WellbeingEntry {
  return {
    session: e.session,
    type: e.type as WellbeingEntry["type"],
    date: e.date.toISOString(),
    scores: parse<Scores>(e.scores, {} as Scores),
    note: e.note,
  };
}

export function dipsFromRow(d: DipsRow): DipsRecord {
  const submission: SubmissionInfo = {
    status: d.submissionStatus as SubmissionInfo["status"],
    endpoint: d.endpoint,
    httpStatus: d.httpStatus ?? undefined,
    at: d.completedAt.toISOString(),
  };
  return {
    lang: d.lang as Lang,
    completedAt: d.completedAt.toISOString(),
    answers: parse<DipsAnswers>(d.answers, {}),
    submission,
  };
}

export function patientFromRow(p: PatientRow): Patient {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    status: p.status as Patient["status"],
    therapistId: p.therapistId,
    demographics: parse<Demographics>(p.demographics, {}),
    entries: [...p.entries].sort((a, b) => a.session - b.session).map(entryFromRow),
    assessment: p.assessmentDate ? { date: p.assessmentDate.toISOString(), type: "dips-anxiety" } : null,
    dips: p.dips ? dipsFromRow(p.dips) : null,
    diagnosis:
      p.diagnosisText && p.diagnosisDate
        ? { text: p.diagnosisText, date: p.diagnosisDate.toISOString(), by: p.diagnosisBy || "" }
        : null,
  };
}
