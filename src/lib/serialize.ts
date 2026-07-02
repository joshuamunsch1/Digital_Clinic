// Map database rows (JSON stored as TEXT) to the application data model.
import type {
  Demographics,
  DipsAnswers,
  DipsRecord,
  InvitationContext,
  InvitationRecord,
  Patient,
  ResponseRecord,
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
  sentAt: Date | null;
  remindedAt: Date | null;
  completedAt: Date | null;
  responseId: string | null;
  lastError: string | null;
  createdAt: Date;
}
interface PatientRow {
  id: string;
  name: string;
  email: string | null;
  color: string;
  status: string;
  therapistId: string | null;
  demographics: string;
  assessmentDate: Date | null;
  diagnosisText: string | null;
  diagnosisDate: Date | null;
  diagnosisBy: string | null;
  responses: ResponseRow[];
  invitations?: InvitationRow[];
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
    sentAt: i.sentAt ? i.sentAt.toISOString() : null,
    remindedAt: i.remindedAt ? i.remindedAt.toISOString() : null,
    completedAt: i.completedAt ? i.completedAt.toISOString() : null,
    responseId: i.responseId,
    lastError: i.lastError,
    createdAt: i.createdAt.toISOString(),
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
    therapistId: p.therapistId,
    demographics: parse<Demographics>(p.demographics, {}),
    responses: responses.map(responseFromRow),
    invitations: (p.invitations ?? []).map(invitationFromRow),
    assessment: p.assessmentDate ? { date: p.assessmentDate.toISOString(), type: "dips-anxiety" } : null,
    dips: dipsRow ? dipsFromResponse(dipsRow) : null,
    diagnosis:
      p.diagnosisText && p.diagnosisDate
        ? { text: p.diagnosisText, date: p.diagnosisDate.toISOString(), by: p.diagnosisBy || "" }
        : null,
  };
}

/// Standard Prisma include for loading a patient with everything the UI needs.
export const PATIENT_INCLUDE = {
  responses: { include: { scaleScores: { include: { scale: true } } } },
  invitations: true,
} as const;
