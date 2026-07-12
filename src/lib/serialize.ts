// Map database rows (JSON stored as TEXT) to the application data model.
import type {
  CaseCharacteristics,
  Demographics,
  DipsAnswers,
  DipsRecord,
  DocumentRecord,
  InvitationContext,
  InvitationRecord,
  Patient,
  ResponseRecord,
  SessionLogRecord,
  SubmissionInfo,
} from "./types";
import { DIPS_INSTRUMENT_ID } from "./types";
import type { InstrumentDef, ItemDef, RawAnswers, ScaleDef } from "./instruments/types";
import type { Lang } from "./i18n";

interface ScaleRow {
  id: string;
  key: string;
  label: string;
  formula: string;
  normBands: string | null;
  range: string | null;
  meta: string;
  sortOrder: number;
}
interface InstrumentRow {
  id: string;
  name: string;
  abbreviation: string;
  population: string;
  raterRole: string;
  instrumentType: string;
  cadenceType: string;
  cadenceConfig: string;
  definitionStatus: string;
  itemSchema: string;
  sourceNotes: string;
  limesurveySurveyId: string | null;
  limesurveyMapping: string;
  scales: ScaleRow[];
}
interface ScaleScoreRow {
  value: number;
  scale: { key: string };
}
interface ResponseRow {
  id: string;
  instrumentId: string;
  respondentRole: string;
  sessionNumber: number | null;
  wave: string | null;
  conductedById: string | null;
  occurredAt: Date;
  rawAnswers: string;
  status: string;
  source: string;
  note: string;
  meta: string;
  scaleScores: ScaleScoreRow[];
}
interface InvitationRow {
  id: string;
  instrumentId: string;
  respondentRole: string;
  email: string;
  surveyId: string | null;
  token: string | null;
  url: string | null;
  status: string;
  context: string;
  channel: string;
  remindEveryDays: number | null;
  maxReminders: number | null;
  reminderCount: number;
  nextReminderAt: Date | null;
  sentAt: Date | null;
  remindedAt: Date | null;
  completedAt: Date | null;
  responseId: string | null;
  lastError: string | null;
  createdAt: Date;
}
interface DocumentRow {
  id: string;
  docType: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  occurredAt: Date;
  note: string;
  uploadedBy: { id: string; name: string } | null;
  createdAt: Date;
}
interface SessionLogRow {
  id: string;
  occurredAt: Date;
  type: string;
  conductedById: string | null;
  note: string;
}
interface PatientRow {
  id: string;
  name: string;
  email: string | null;
  color: string;
  status: string;
  disorderCategory: string | null;
  code: string | null;
  icdCode: string | null;
  treatmentStartAt: Date | null;
  treatmentEndAt: Date | null;
  terminationReason: string | null;
  caseCharacteristics: string;
  simulated: boolean;
  therapistId: string | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  demographics: string;
  assessmentDate: Date | null;
  diagnosisText: string | null;
  diagnosisDate: Date | null;
  diagnosisBy: string | null;
  responses: ResponseRow[];
  invitations?: InvitationRow[];
  documents?: DocumentRow[];
  sessionLogs?: SessionLogRow[];
}

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/// One JSON blob on ResponseInstance.meta carries instrument-specific extras.
/// For DIPS: { lang, fhir, submission: { status, endpoint, httpStatus } }.
export interface DipsMeta {
  lang?: Lang;
  fhir?: unknown;
  submission?: SubmissionInfo;
}

export function instrumentFromRow(row: InstrumentRow): InstrumentDef {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    population: row.population,
    raterRole: row.raterRole,
    instrumentType: row.instrumentType as InstrumentDef["instrumentType"],
    cadenceType: row.cadenceType as InstrumentDef["cadenceType"],
    cadenceConfig: parse(row.cadenceConfig, {}),
    definitionStatus: row.definitionStatus as InstrumentDef["definitionStatus"],
    items: parse<ItemDef[]>(row.itemSchema, []),
    scales: [...row.scales]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(
        (s): ScaleDef => ({
          key: s.key,
          label: s.label,
          formula: parse<ScaleDef["formula"]>(s.formula, { type: "custom" }),
          normBands: parse(s.normBands, undefined as ScaleDef["normBands"]),
          range: parse(s.range, undefined as ScaleDef["range"]),
          ...parse<Pick<ScaleDef, "higherIsBetter" | "alert" | "rci">>(s.meta, {}),
          sortOrder: s.sortOrder,
        }),
      ),
    sourceNotes: row.sourceNotes,
    limesurveySurveyId: row.limesurveySurveyId,
    limesurveyMapping: parse(row.limesurveyMapping, {}),
  };
}

export function responseFromRow(r: ResponseRow): ResponseRecord {
  const scores: Record<string, number> = {};
  for (const s of r.scaleScores) scores[s.scale.key] = s.value;
  return {
    id: r.id,
    instrumentId: r.instrumentId,
    respondentRole: r.respondentRole,
    sessionNumber: r.sessionNumber,
    wave: r.wave,
    conductedById: r.conductedById,
    occurredAt: r.occurredAt.toISOString(),
    rawAnswers: parse<RawAnswers>(r.rawAnswers, {}),
    status: r.status,
    source: r.source,
    note: r.note,
    scores,
  };
}

export function invitationFromRow(i: InvitationRow): InvitationRecord {
  return {
    id: i.id,
    instrumentId: i.instrumentId,
    respondentRole: i.respondentRole,
    email: i.email,
    surveyId: i.surveyId,
    token: i.token,
    url: i.url,
    status: i.status,
    context: parse<InvitationContext>(i.context, {}),
    channel: i.channel,
    remindEveryDays: i.remindEveryDays,
    maxReminders: i.maxReminders,
    reminderCount: i.reminderCount,
    nextReminderAt: i.nextReminderAt ? i.nextReminderAt.toISOString() : null,
    sentAt: i.sentAt ? i.sentAt.toISOString() : null,
    remindedAt: i.remindedAt ? i.remindedAt.toISOString() : null,
    completedAt: i.completedAt ? i.completedAt.toISOString() : null,
    responseId: i.responseId,
    lastError: i.lastError,
    createdAt: i.createdAt.toISOString(),
  };
}

export function documentFromRow(d: DocumentRow): DocumentRecord {
  return {
    id: d.id,
    docType: d.docType,
    title: d.title,
    fileName: d.fileName,
    mimeType: d.mimeType,
    size: d.size,
    occurredAt: d.occurredAt.toISOString(),
    note: d.note,
    uploadedBy: d.uploadedBy ? { id: d.uploadedBy.id, name: d.uploadedBy.name } : null,
    createdAt: d.createdAt.toISOString(),
  };
}

function dipsFromResponse(r: ResponseRow): DipsRecord {
  const meta = parse<DipsMeta>(r.meta, {});
  return {
    lang: meta.lang ?? "de",
    completedAt: r.occurredAt.toISOString(),
    answers: parse<DipsAnswers>(r.rawAnswers, {}),
    submission: meta.submission,
  };
}

export function sessionLogFromRow(l: SessionLogRow): SessionLogRecord {
  return {
    id: l.id,
    occurredAt: l.occurredAt.toISOString(),
    type: l.type,
    conductedById: l.conductedById,
    note: l.note,
  };
}

export function patientFromRow(p: PatientRow): Patient {
  const responses = [...p.responses].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  const dipsRow = responses.find((r) => r.instrumentId === DIPS_INSTRUMENT_ID);
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    color: p.color,
    status: p.status as Patient["status"],
    disorderCategory: p.disorderCategory,
    code: p.code,
    icdCode: p.icdCode,
    treatmentStartAt: p.treatmentStartAt ? p.treatmentStartAt.toISOString() : null,
    treatmentEndAt: p.treatmentEndAt ? p.treatmentEndAt.toISOString() : null,
    terminationReason: p.terminationReason,
    caseCharacteristics: parse<CaseCharacteristics>(p.caseCharacteristics, {}),
    simulated: p.simulated,
    therapistId: p.therapistId,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    archivedBy: p.archivedBy,
    demographics: parse<Demographics>(p.demographics, {}),
    responses: responses.map(responseFromRow),
    invitations: (p.invitations ?? []).map(invitationFromRow),
    documents: [...(p.documents ?? [])]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(documentFromRow),
    sessionLogs: [...(p.sessionLogs ?? [])]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(sessionLogFromRow),
    assessment: p.assessmentDate ? { date: p.assessmentDate.toISOString(), type: "dips-anxiety" } : null,
    dips: dipsRow ? dipsFromResponse(dipsRow) : null,
    diagnosis:
      p.diagnosisText && p.diagnosisDate
        ? { text: p.diagnosisText, date: p.diagnosisDate.toISOString(), by: p.diagnosisBy || "" }
        : null,
  };
}

/// Summary form for ARCHIVED patients in the clinic payload: everything the
/// archive tree and list rows need (name, category, archive metadata,
/// termination reason, code, simulated flag) but WITHOUT the response/
/// invitation/session-log payloads — with a couple hundred archived reference
/// cases those would dominate the transfer. The full dossier is fetched via
/// GET /api/patients/[id] when an archived patient is opened.
export function patientSummaryFromRow(p: Omit<PatientRow, "responses" | "invitations" | "sessionLogs" | "documents">): Patient {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    color: p.color,
    status: p.status as Patient["status"],
    disorderCategory: p.disorderCategory,
    code: p.code,
    icdCode: p.icdCode,
    treatmentStartAt: p.treatmentStartAt ? p.treatmentStartAt.toISOString() : null,
    treatmentEndAt: p.treatmentEndAt ? p.treatmentEndAt.toISOString() : null,
    terminationReason: p.terminationReason,
    caseCharacteristics: parse<CaseCharacteristics>(p.caseCharacteristics, {}),
    simulated: p.simulated,
    therapistId: p.therapistId,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    archivedBy: p.archivedBy,
    demographics: parse<Demographics>(p.demographics, {}),
    responses: [],
    invitations: [],
    documents: [],
    sessionLogs: [],
    assessment: p.assessmentDate ? { date: p.assessmentDate.toISOString(), type: "dips-anxiety" } : null,
    dips: null,
    diagnosis:
      p.diagnosisText && p.diagnosisDate
        ? { text: p.diagnosisText, date: p.diagnosisDate.toISOString(), by: p.diagnosisBy || "" }
        : null,
  };
}

/// Administration view of a patient: assignment-relevant fields only — no
/// responses, scores, DIPS, diagnosis text or demographics detail. The disorder
/// category IS included (clinic decision: needed for specialty-based assignment).
export function patientLiteFromRow(p: PatientRow): Patient {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    color: p.color,
    status: p.status as Patient["status"],
    disorderCategory: p.disorderCategory,
    // All clinical/research fields stay hidden from administration: codes,
    // episode labels, intake predictors, ICD — none are assignment-relevant.
    code: null,
    icdCode: null,
    treatmentStartAt: null,
    treatmentEndAt: null,
    terminationReason: null,
    caseCharacteristics: {},
    simulated: p.simulated,
    therapistId: p.therapistId,
    // archivedAt is assignment-relevant (drives list exclusion); the outcome
    // label and who archived are clinical-ish context the admin doesn't need.
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    archivedBy: null,
    demographics: {},
    responses: [],
    invitations: [],
    documents: [],
    sessionLogs: [],
    assessment: p.assessmentDate ? { date: p.assessmentDate.toISOString(), type: "dips-anxiety" } : null,
    dips: null,
    diagnosis: null,
  };
}

/// Role-scoped patient payload: admin gets the lite view (no clinical data),
/// patients get their own record minus staff working artifacts (the document
/// timeline and session-log notes are staff surfaces), staff get everything.
export function patientForSession(p: PatientRow, role: string): Patient {
  if (role === "admin") return patientLiteFromRow(p);
  const full = patientFromRow(p);
  return role === "patient" ? { ...full, documents: [], sessionLogs: [] } : full;
}

/// Standard Prisma include for loading a patient with everything the UI needs.
export const PATIENT_INCLUDE = {
  responses: { include: { scaleScores: { include: { scale: true } } } },
  invitations: true,
  documents: { include: { uploadedBy: { select: { id: true, name: true } } } },
  sessionLogs: true,
} as const;
