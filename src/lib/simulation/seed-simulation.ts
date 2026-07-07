// Writes the simulated cohort to the database: ~SIM_COHORT_SIZE archived,
// labeled reference treatments plus 10 ACTIVE scripted patients that each
// demonstrate one feedback state in the UI. Deterministic (fixed seeds),
// flagged `simulated: true` everywhere, removable via `npm run sim:purge`.
//
// Performance: item answers are scored in memory with the real engine, then
// written with chunked createMany + pre-assigned ids (a row-by-row create of
// ~10k responses would take minutes on SQLite). No filesystem archive export
// for simulated patients — 250 folders of fake dossiers would pollute
// archive/; ArchiveView reads the DB.
import type { PrismaClient } from "@prisma/client";
import { computeScaleScores } from "../instruments/scoring";
import type { InstrumentDef, RawAnswers } from "../instruments/types";
import { formatPatientCode } from "../patient-code";
import { PALETTE } from "../theme";
import { SESSION_INSTRUMENT_ID, type CaseCharacteristics } from "../types";
import { bdiFsAnswers, phq4Answers, pstbAnswers } from "./answers";
import { generateCohort, simDiagnosisText, SIM_MASTER_SEED, type SimCase } from "./cohort";
import { clampNum, mulberry32, normal, type Rng } from "./rng";

export const SIM_COHORT_SIZE = 250;

interface SeededInstrument {
  def: InstrumentDef;
  scaleIds: Record<string, string>;
}

interface PatientRow {
  id: string;
  name: string;
  color: string;
  status: string;
  disorderCategory: string;
  code: string;
  icdCode: string;
  caseCharacteristics: string;
  simulated: boolean;
  therapistId: string;
  demographics: string;
  assessmentDate: Date;
  diagnosisText: string;
  diagnosisDate: Date;
  diagnosisBy: string;
  treatmentStartAt: Date;
  treatmentEndAt: Date | null;
  terminationReason: string | null;
  archivedAt: Date | null;
  archivedBy: string | null;
}

interface ResponseRow {
  id: string;
  patientId: string;
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
}

interface ScoreRow {
  responseInstanceId: string;
  scaleId: string;
  value: number;
}

interface LogRow {
  patientId: string;
  occurredAt: Date;
  type: string;
  conductedById: string | null;
  note: string;
}

const CHUNK = 500;

async function insertChunked<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK));
}

export interface SimSeedResult {
  archived: number;
  active: number;
  responses: number;
  scaleScores: number;
  sessionLogs: number;
}

export async function seedSimulation(
  prisma: PrismaClient,
  instruments: Map<string, SeededInstrument>,
  opts: { n?: number; startCodeSeq?: number; therapistIds?: string[] } = {},
): Promise<SimSeedResult> {
  const n = opts.n ?? SIM_COHORT_SIZE;
  if (n <= 0) return { archived: 0, active: 0, responses: 0, scaleScores: 0, sessionLogs: 0 };
  const startCodeSeq = opts.startCodeSeq ?? 100;
  const therapistIds = opts.therapistIds ?? ["t1", "t2", "t3"];

  const pstb = instruments.get(SESSION_INSTRUMENT_ID)!;
  const phq4 = instruments.get("phq4")!;
  const bdi = instruments.get("bdi_fs")!;

  const patients: PatientRow[] = [];
  const responses: ResponseRow[] = [];
  const scores: ScoreRow[] = [];
  const logs: LogRow[] = [];
  let responseSeq = 0;

  const score = (inst: SeededInstrument, responseId: string, answers: RawAnswers) => {
    const computed = computeScaleScores(inst.def.items, inst.def.scales, answers).scores;
    for (const [key, value] of Object.entries(computed)) {
      const scaleId = inst.scaleIds[key];
      if (scaleId) scores.push({ responseInstanceId: responseId, scaleId, value });
    }
  };

  const addResponse = (
    patientId: string,
    inst: SeededInstrument,
    answers: RawAnswers,
    at: Date,
    conductedById: string | null,
    occasion: { sessionNumber?: number; wave?: string },
  ) => {
    const id = `sim-r-${String(++responseSeq).padStart(6, "0")}`;
    responses.push({
      id,
      patientId,
      instrumentId: inst.def.id,
      respondentRole: "self",
      sessionNumber: occasion.sessionNumber ?? null,
      wave: occasion.wave ?? null,
      conductedById,
      occurredAt: at,
      rawAnswers: JSON.stringify(answers),
      status: "complete",
      source: "seed",
      note: "",
      meta: "{}",
    });
    score(inst, id, answers);
  };

  // --- Archived reference cohort ---------------------------------------------
  const cohort = generateCohort(n, { therapistIds });
  const answerRng = mulberry32(SIM_MASTER_SEED ^ 0x5eed);
  for (const c of cohort) {
    const id = `sim-p-${String(c.index + 1).padStart(4, "0")}`;
    patients.push({
      id,
      name: `${c.firstName} ${c.lastName}`,
      color: PALETTE[c.index % PALETTE.length],
      status: "archived",
      disorderCategory: c.disorderCategory,
      code: formatPatientCode(startCodeSeq + c.index),
      icdCode: c.icd,
      caseCharacteristics: JSON.stringify(c.caseCharacteristics),
      simulated: true,
      therapistId: c.therapistId,
      demographics: JSON.stringify({ age: c.age, sex: c.sex }),
      assessmentDate: c.treatmentStart,
      diagnosisText: simDiagnosisText(c.disorderCategory),
      diagnosisDate: c.treatmentStart,
      diagnosisBy: "Simulation",
      treatmentStartAt: c.treatmentStart,
      treatmentEndAt: c.treatmentEnd,
      terminationReason: c.terminationReason,
      archivedAt: c.treatmentEnd,
      archivedBy: "Simulation",
    });

    for (const s of c.sessions) {
      if (s.phqTarget === null || s.pstbTarget === null) {
        // Held but unmeasured — realistic missingness (§4.5).
        logs.push({ patientId: id, occurredAt: s.date, type: "held", conductedById: c.therapistId, note: "" });
        continue;
      }
      addResponse(id, pstb, pstbAnswers(answerRng, s.pstbTarget), s.date, c.therapistId, { sessionNumber: s.index });
      addResponse(id, phq4, phq4Answers(answerRng, s.phqTarget), s.date, c.therapistId, { sessionNumber: s.index });
    }
    for (const l of c.extraLogs)
      logs.push({ patientId: id, occurredAt: l.date, type: l.type, conductedById: c.therapistId, note: "" });
    for (const w of c.bdiWaves ?? [])
      addResponse(id, bdi, bdiFsAnswers(answerRng, w.severity01), w.date, null, { wave: w.wave });
  }

  // --- 10 active scripted patients (one per feedback state) -------------------
  const active = scriptedActivePatients(therapistIds, startCodeSeq + n);
  const activeRng = mulberry32(SIM_MASTER_SEED ^ 0xac71fe);
  for (const a of active) {
    patients.push(a.row);
    a.sessions.forEach((phqTarget, sessionIndex) => {
      const at = new Date(a.lastSessionAt.getTime() - (a.sessions.length - 1 - sessionIndex) * 7 * 864e5);
      const pstbTarget = clampNum(3 - phqTarget / 2 + normal(activeRng, 0, 0.3), -3, 3);
      addResponse(a.row.id, pstb, pstbAnswers(activeRng, pstbTarget), at, a.row.therapistId, { sessionNumber: sessionIndex });
      addResponse(a.row.id, phq4, phq4Answers(activeRng, phqTarget), at, a.row.therapistId, { sessionNumber: sessionIndex });
    });
    for (const l of a.logs ?? [])
      logs.push({ patientId: a.row.id, occurredAt: l.date, type: l.type, conductedById: a.row.therapistId, note: l.note ?? "" });
  }

  await insertChunked(patients, (chunk) => prisma.patient.createMany({ data: chunk }));
  await insertChunked(responses, (chunk) => prisma.responseInstance.createMany({ data: chunk }));
  await insertChunked(scores, (chunk) => prisma.scaleScore.createMany({ data: chunk }));
  await insertChunked(logs, (chunk) => prisma.sessionLog.createMany({ data: chunk }));

  return {
    archived: cohort.length,
    active: active.length,
    responses: responses.length,
    scaleScores: scores.length,
    sessionLogs: logs.length,
  };
}

interface ActiveSpec {
  row: PatientRow;
  /// PHQ-4 total targets per session (0 = baseline).
  sessions: number[];
  lastSessionAt: Date;
  logs?: { date: Date; type: string; note?: string }[];
}

/// Each scripted patient demonstrates exactly one feedback state (on track,
/// NOT via band, NOT via RCI, sudden gain, sudden loss, early deterioration +
/// high dropout risk, early response, indeterminate, insufficient data,
/// session logs). Series values are chosen so the criteria fire by
/// construction — see tests/simulation.test.ts for the cohort-level checks.
function scriptedActivePatients(therapistIds: string[], codeStart: number): ActiveSpec[] {
  const TH = (i: number) => therapistIds[i % therapistIds.length];
  const LAST = new Date("2026-07-01T10:00:00.000Z");
  const cc = (over: Partial<CaseCharacteristics>): string =>
    JSON.stringify({
      problemDuration: "m6to24",
      priorPsychotherapy: false,
      psychotropicMedication: false,
      employment: "employed",
      treatmentExpectation: 6,
      ...over,
    });

  const specs: {
    slug: string;
    name: string;
    sex: string;
    age: number;
    category: string;
    icd: string;
    cc: string;
    sessions: number[];
    logs?: { daysAgo: number; type: string; note?: string }[];
  }[] = [
    { slug: "on-track", name: "Sina Albrecht", sex: "Female", age: 31, category: "depression", icd: "F32.1", cc: cc({}), sessions: [8, 7, 6.5, 6, 5.5, 5, 4.5, 4] },
    // Mid-severity baseline drifting upward: crosses the mid-stratum p90
    // boundary for ≥2 consecutive sessions while the baseline-anchored change
    // (+2) stays under the RCI cutoff (~2.9) — the band-only NOT demo. (The
    // top tertile can't demo this: its p90 saturates at the scale ceiling.)
    { slug: "not-band", name: "Milo Berger", sex: "Male", age: 44, category: "depression", icd: "F33.1", cc: cc({ treatmentExpectation: 4 }), sessions: [8, 9, 9.5, 10, 10, 10] },
    { slug: "not-rci", name: "Petra Custer", sex: "Female", age: 52, category: "anxiety", icd: "F41.1", cc: cc({ problemDuration: "gt24m" }), sessions: [5, 5.5, 6, 7, 8.5] },
    { slug: "sudden-gain", name: "Ralf Dorn", sex: "Male", age: 38, category: "anxiety", icd: "F41.0", cc: cc({}), sessions: [9, 8.5, 9, 8.75, 9, 3.5, 3, 3.25, 3] },
    { slug: "sudden-loss", name: "Alma Egli", sex: "Female", age: 27, category: "depression", icd: "F32.2", cc: cc({ psychotropicMedication: true }), sessions: [4, 3.5, 4, 3.75, 4, 9, 9.5, 9.25] },
    { slug: "early-det", name: "Timon Fuchs", sex: "Male", age: 23, category: "other", icd: "F43.2", cc: cc({ problemDuration: "gt24m", employment: "unemployed", treatmentExpectation: 2, psychotropicMedication: true, priorPsychotherapy: true }), sessions: [7, 8, 9, 10.5] },
    { slug: "early-resp", name: "Greta Hasler", sex: "Female", age: 35, category: "anxiety", icd: "F40.1", cc: cc({ treatmentExpectation: 9 }), sessions: [9, 6.5, 5, 4] },
    { slug: "indeterminate", name: "Otto Imhof", sex: "Male", age: 58, category: "burnout", icd: "Z73.0", cc: cc({ employment: "retired" }), sessions: [6, 5.5, 6, 5.5, 6, 5.5] },
    { slug: "two-sessions", name: "Nora Jung", sex: "Female", age: 29, category: "eating_disorder", icd: "F50.2", cc: cc({}), sessions: [7, 6.5] },
    { slug: "with-logs", name: "Karin Lang", sex: "Female", age: 41, category: "depression", icd: "F32.1", cc: cc({}), sessions: [8, 7, 6, 5.5, 5, 4.5], logs: [{ daysAgo: 17, type: "cancelled", note: "Krankheit" }, { daysAgo: 38, type: "no_show" }] },
  ];

  return specs.map((s, i) => {
    const firstSessionAt = new Date(LAST.getTime() - (s.sessions.length - 1) * 7 * 864e5);
    return {
      row: {
        id: `sim-a-${s.slug}`,
        name: s.name,
        color: PALETTE[(i + 3) % PALETTE.length],
        status: "therapy",
        disorderCategory: s.category,
        code: formatPatientCode(codeStart + i),
        icdCode: s.icd,
        caseCharacteristics: s.cc,
        simulated: true,
        therapistId: TH(i),
        demographics: JSON.stringify({ age: s.age, sex: s.sex }),
        assessmentDate: firstSessionAt,
        diagnosisText: simDiagnosisText(s.category),
        diagnosisDate: firstSessionAt,
        diagnosisBy: "Simulation",
        treatmentStartAt: firstSessionAt,
        treatmentEndAt: null,
        terminationReason: null,
        archivedAt: null,
        archivedBy: null,
      },
      sessions: s.sessions,
      lastSessionAt: LAST,
      logs: (s.logs ?? []).map((l) => ({
        date: new Date(LAST.getTime() - l.daysAgo * 864e5),
        type: l.type,
        note: l.note,
      })),
    };
  });
}
