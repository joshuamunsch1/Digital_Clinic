// Assembles the therapist-facing prediction payloads (expected-course bands,
// nearest-neighbor courses + failure boundary, ETR curve, sudden shifts,
// early change, not-on-track status, dropout risk) from the cached reference
// data. Server-only; the routes above this never expose it to patient
// sessions, and neighbor summaries carry research CODES only — never names.
import type { PrismaClient } from "@prisma/client";
import { predictDropoutRisk } from "../analytics/dropout-risk";
import { classifyEarlyChange } from "../analytics/early-change";
import { predictEtr } from "../analytics/etr";
import {
  classifyOnTrack,
  stratifiedExpectedCourse,
  type StratifiedCourse,
} from "../analytics/expected-course";
import { dynamicNeighbors, nnExpectedCourse } from "../analytics/nearest-neighbors";
import { percentile } from "../analytics/stats";
import { detectSuddenShifts } from "../analytics/sudden-shifts";
import {
  indexedSeriesOf,
  seriesKeyOf,
  sessionSeriesOf,
  type EarlyChange,
  type ExpectedCoursePoint,
  type OnTrackResult,
  type SessionPoint,
  type SuddenShift,
} from "../analytics/types";
import { PATIENT_INCLUDE, patientFromRow } from "../serialize";
import type { Patient } from "../types";
import {
  PREDICTION_TARGETS,
  PRIMARY_KEY,
  baselineOf,
  getReferenceData,
  intakeFeaturesOf,
  type ReferenceData,
} from "./reference";

const NN_K = 20;
const NN_MIN_REFERENCE = 30;

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export interface SeriesPrediction {
  instrumentId: string;
  scaleKey: string;
  expectedCourse: {
    points: ExpectedCoursePoint[];
    stratified: boolean;
    stratum?: 0 | 1 | 2;
    cases: number;
  };
  nn: {
    available: boolean;
    reason?: "insufficient_reference";
    k?: number;
    points?: ExpectedCoursePoint[];
    failureBoundary?: { session: number; value: number }[];
    neighborSummary?: {
      codes: string[];
      medianSessions: number | null;
      outcomes: Record<string, number>;
    };
  };
  etr: { available: boolean; points?: { session: number; expected: number }[]; note: string };
  suddenShifts: SuddenShift[];
  earlyChange: EarlyChange | null;
  onTrack: OnTrackResult;
}

export interface PredictionPayload {
  generatedAt: string;
  reference: { n: number; includesSimulated: boolean };
  series: SeriesPrediction[];
  dropoutRisk: {
    available: boolean;
    probability?: number;
    trainN?: number;
    baseRate?: number;
    trainAuc?: number;
    topFactors?: { feature: string; contribution: number }[];
    includesSimulated: boolean;
  };
}

function predictSeries(
  ref: ReferenceData,
  patientSeries: SessionPoint[],
  patientFeatures: ReturnType<typeof intakeFeaturesOf>,
  instrumentId: string,
  scaleKey: string,
): SeriesPrediction | null {
  const key = seriesKeyOf(instrumentId, scaleKey);
  const scale = ref.scaleParamsByKey.get(key);
  if (!scale) return null;

  const withSeries = ref.cases.filter((c) => (c.series[key] ?? []).length > 0);

  // Empirical percentile band, severity-stratified when the gates allow.
  const course: StratifiedCourse = stratifiedExpectedCourse(
    withSeries.map((c) => ({
      baseline: baselineOf(c.series[key] ?? []) ?? 0,
      series: c.series[key] ?? [],
    })),
    baselineOf(patientSeries),
  );

  // Nearest neighbors with the dynamic (observed-course-aware) similarity.
  let nn: SeriesPrediction["nn"] = { available: false, reason: "insufficient_reference" };
  if (withSeries.length >= NN_MIN_REFERENCE) {
    const neighbors = dynamicNeighbors(patientFeatures, patientSeries, withSeries, NN_K, key, scale);
    if (neighbors.length >= Math.min(NN_K, NN_MIN_REFERENCE)) {
      const { points, failureBoundary } = nnExpectedCourse(neighbors, key, scale);
      const sessionCounts = neighbors
        .map((nb) => nb.c.sessionCount)
        .filter((v): v is number => v !== null);
      const outcomes: Record<string, number> = {};
      for (const nb of neighbors) {
        const r = nb.c.terminationReason ?? "unknown";
        outcomes[r] = (outcomes[r] ?? 0) + 1;
      }
      nn = {
        available: true,
        k: neighbors.length,
        points,
        failureBoundary,
        neighborSummary: {
          codes: neighbors.map((nb) => nb.c.code),
          medianSessions: sessionCounts.length ? Math.round(percentile(sessionCounts, 0.5)) : null,
          outcomes,
        },
      };
    }
  }

  // ETR expected-value curve (two-stage approximation — labeled as such).
  const etrModel = ref.etrModels.get(key);
  const lastSession = patientSeries.length ? patientSeries[patientSeries.length - 1].session : 0;
  const horizon = Math.min(40, Math.max(lastSession + 8, 20));
  const etr: SeriesPrediction["etr"] = etrModel
    ? {
        available: true,
        points: predictEtr(etrModel, patientFeatures, Array.from({ length: horizon + 1 }, (_, s) => s)),
        note: "two_stage_ols",
      }
    : { available: false, note: "two_stage_ols" };

  return {
    instrumentId,
    scaleKey,
    expectedCourse: {
      points: course.points,
      stratified: course.stratified,
      stratum: course.stratum,
      cases: course.cases,
    },
    nn,
    etr,
    suddenShifts: detectSuddenShifts(patientSeries, scale),
    earlyChange: classifyEarlyChange(patientSeries, scale),
    onTrack: classifyOnTrack(patientSeries, course.points, scale),
  };
}

function featuresForPatient(patient: Patient, primarySeries: SessionPoint[]) {
  return intakeFeaturesOf({
    demographics: patient.demographics,
    disorderCategory: patient.disorderCategory,
    caseCharacteristics: patient.caseCharacteristics,
    baselineSeverity: baselineOf(primarySeries),
  });
}

export async function buildPrediction(prisma: PrismaClient, patientId: string): Promise<PredictionPayload | null> {
  const row = await prisma.patient.findUnique({ where: { id: patientId }, include: PATIENT_INCLUDE });
  if (!row) return null;
  const patient = patientFromRow(row);
  const ref = await getReferenceData(prisma);

  const primarySeries = sessionSeriesOf(patient.responses, PREDICTION_TARGETS[0].instrumentId, PREDICTION_TARGETS[0].scaleKey);
  const features = featuresForPatient(patient, primarySeries);

  const series: SeriesPrediction[] = [];
  for (const t of PREDICTION_TARGETS) {
    // Index-axis targets (BDI-FS) align by measurement order, mirroring how
    // the reference series were built in reference.ts.
    const patientSeries =
      t.axis === "index"
        ? indexedSeriesOf(patient.responses, t.instrumentId, t.scaleKey)
        : sessionSeriesOf(patient.responses, t.instrumentId, t.scaleKey);
    const s = predictSeries(ref, patientSeries, features, t.instrumentId, t.scaleKey);
    if (s) series.push(s);
  }

  const primaryScale = ref.scaleParamsByKey.get(PRIMARY_KEY);
  const early = primaryScale ? classifyEarlyChange(primarySeries, primaryScale) : null;
  const dropoutRisk: PredictionPayload["dropoutRisk"] = ref.dropoutModel
    ? {
        available: true,
        ...predictDropoutRisk(ref.dropoutModel, features, early),
        trainN: ref.dropoutModel.n,
        baseRate: ref.dropoutModel.baseRate,
        trainAuc: ref.dropoutModel.trainAuc,
        includesSimulated: ref.includesSimulated,
      }
    : { available: false, includesSimulated: ref.includesSimulated };

  return {
    generatedAt: new Date().toISOString(),
    reference: { n: ref.cases.length, includesSimulated: ref.includesSimulated },
    series,
    dropoutRisk,
  };
}

export interface PredictionSummary {
  earlyChange: EarlyChange | null;
  onTrack: OnTrackResult["status"];
  dropoutRisk: number | null;
}

/// One-pass summaries for dashboard badges (primary target only). `patients`
/// must already be role-scoped by the caller.
export async function buildPredictionSummaries(
  prisma: PrismaClient,
  patientIds: string[],
): Promise<Record<string, PredictionSummary>> {
  if (!patientIds.length) return {};
  const ref = await getReferenceData(prisma);
  const scale = ref.scaleParamsByKey.get(PRIMARY_KEY);
  if (!scale) return {};

  const rows = await prisma.patient.findMany({
    where: { id: { in: patientIds } },
    select: {
      id: true,
      demographics: true,
      disorderCategory: true,
      caseCharacteristics: true,
      responses: {
        where: { instrumentId: PREDICTION_TARGETS[0].instrumentId, sessionNumber: { not: null } },
        select: {
          sessionNumber: true,
          occurredAt: true,
          scaleScores: { select: { value: true, scale: { select: { key: true } } } },
        },
      },
    },
  });

  const referenceForBand = ref.cases
    .filter((c) => (c.series[PRIMARY_KEY] ?? []).length > 0)
    .map((c) => ({
      baseline: baselineOf(c.series[PRIMARY_KEY] ?? []) ?? 0,
      series: c.series[PRIMARY_KEY] ?? [],
    }));

  const out: Record<string, PredictionSummary> = {};
  for (const r of rows) {
    const bySession = new Map<number, { at: number; value: number }>();
    for (const resp of r.responses) {
      const score = resp.scaleScores.find((s) => s.scale.key === PREDICTION_TARGETS[0].scaleKey);
      if (!score || resp.sessionNumber === null) continue;
      const prev = bySession.get(resp.sessionNumber);
      if (!prev || resp.occurredAt.getTime() >= prev.at)
        bySession.set(resp.sessionNumber, { at: resp.occurredAt.getTime(), value: score.value });
    }
    const series: SessionPoint[] = Array.from(bySession.entries())
      .map(([session, { value }]) => ({ session, value }))
      .sort((a, b) => a.session - b.session);

    const early = classifyEarlyChange(series, scale);
    const course = stratifiedExpectedCourse(referenceForBand, baselineOf(series));
    const onTrack = classifyOnTrack(series, course.points, scale);

    let dropoutRisk: number | null = null;
    if (ref.dropoutModel) {
      const features = intakeFeaturesOf({
        demographics: parseJson(r.demographics, {}),
        disorderCategory: r.disorderCategory,
        caseCharacteristics: parseJson(r.caseCharacteristics, {}),
        baselineSeverity: baselineOf(series),
      });
      dropoutRisk = predictDropoutRisk(ref.dropoutModel, features, early).probability;
    }
    out[r.id] = { earlyChange: early, onTrack: onTrack.status, dropoutRisk };
  }
  return out;
}
