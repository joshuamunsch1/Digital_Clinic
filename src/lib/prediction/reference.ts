// Server-side reference sample for outcome prediction: every archived patient
// with a coded termination reason, loaded lean (only the two prediction-target
// series), plus the models trained from it. Cached at module level and
// invalidated by a cheap version probe (labeled-archived count + latest
// archivedAt) — archiving, unarchiving and re-labeling all change the probe,
// so no write hook can be forgotten. Simulated cases participate like real
// ones; `includesSimulated` travels with every payload so the UI can badge
// predictions honestly, and `npm run sim:purge` is the real-data cutover.
import type { PrismaClient } from "@prisma/client";
import { consecutiveDeltas } from "../analytics/alliance";
import { attendanceFeatures } from "../analytics/attendance";
import { trainDropoutModel, type DropoutModel } from "../analytics/dropout-risk";
import { trainEtr, type EtrModel } from "../analytics/etr";
import {
  scaleParams,
  seriesKeyOf,
  type IntakeFeatures,
  type ReferenceCase,
  type ScaleParams,
  type SessionPoint,
} from "../analytics/types";
import { instrumentFromRow } from "../serialize";
import {
  SESSION_INSTRUMENT_ID,
  SESSION_PRIMARY_SCALE,
  type CaseCharacteristics,
  type Demographics,
} from "../types";

/// The (instrument, scale) pairs prediction runs on. The PHQ-4 total is the
/// PRIMARY target (the symptom measure — Lutz's HSCL-11 slot): it drives the
/// not-on-track flag, early-change classification and the dropout features.
/// The PSTB headline scale gets bands and sudden-shift markers as well.
/// axis "session" aligns cases by sessionNumber; "index" by measurement order
/// (0, 1, 2… chronologically) — used for the wave-/date-cadenced BDI-FS, whose
/// responses carry no sessionNumber (sim cohort: pre/zm/post waves).
export type TargetAxis = "session" | "index";
export const PREDICTION_TARGETS = [
  { instrumentId: "phq4", scaleKey: "PHQ_total", axis: "session" },
  { instrumentId: SESSION_INSTRUMENT_ID, scaleKey: SESSION_PRIMARY_SCALE, axis: "session" },
  { instrumentId: "bdi_fs", scaleKey: "BDI_FS_total", axis: "index" },
] as const;
export const PRIMARY_TARGET = PREDICTION_TARGETS[0];
export const PRIMARY_KEY = seriesKeyOf(PRIMARY_TARGET.instrumentId, PRIMARY_TARGET.scaleKey);

/// Session-axis alliance scales monitored for rupture signals (Batch 13).
/// The child form works through the identical path; today it has no reference
/// rows, so its empirical criterion stays silently gated.
export const ALLIANCE_SERIES = [
  { instrumentId: SESSION_INSTRUMENT_ID, scaleKey: "Therapiebeziehung" },
  { instrumentId: "sbkj_child", scaleKey: "Therapiebeziehung" },
] as const;

/// Jacobson–Truax clinical cutoff c for the PRIMARY target: the published
/// PHQ-4 norm-band boundary unauffällig (≤2) | mild (≥3) → 2.5. This is the
/// pragmatic band boundary, NOT a derived JT criterion c (which would need
/// functional/dysfunctional distributions) [clinician-confirm].
export const PRIMARY_CLINICAL_CUTOFF = 2.5;

export interface ReferenceData {
  version: string;
  cases: ReferenceCase[];
  includesSimulated: boolean;
  /// ScaleParams keyed by seriesKey ("instrumentId|scaleKey").
  scaleParamsByKey: Map<string, ScaleParams>;
  dropoutModel: DropoutModel | null;
  /// Two-stage log-linear ETR per target seriesKey.
  etrModels: Map<string, EtrModel>;
  /// Pooled consecutive-session deltas of the reference cohort per alliance
  /// seriesKey — the empirical rupture criterion's calibration sample.
  allianceDeltas: Map<string, number[]>;
}

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const toNumber = (v: string | number | undefined): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const DURATION_ORDINAL: Record<string, 0 | 1 | 2> = { lt6m: 0, m6to24: 1, gt24m: 2 };

/// Assemble the intake-feature vector from stored patient fields — shared by
/// reference cases and live patients so both sides of every comparison are
/// encoded identically.
export function intakeFeaturesOf(p: {
  demographics: Demographics;
  disorderCategory: string | null;
  caseCharacteristics: CaseCharacteristics;
  baselineSeverity: number | null;
}): IntakeFeatures {
  const cc = p.caseCharacteristics;
  return {
    age: toNumber(p.demographics.age),
    sex: p.demographics.sex ?? null,
    disorderCategory: p.disorderCategory,
    baselineSeverity: p.baselineSeverity,
    problemDuration: cc.problemDuration !== undefined ? DURATION_ORDINAL[cc.problemDuration] : null,
    priorPsychotherapy: cc.priorPsychotherapy ?? null,
    psychotropicMedication: cc.psychotropicMedication ?? null,
    employment: cc.employment ?? null,
    treatmentExpectation: cc.treatmentExpectation ?? null,
  };
}

export const baselineOf = (series: SessionPoint[]): number | null =>
  series.length ? [...series].sort((a, b) => a.session - b.session)[0].value : null;

interface CacheSlot {
  version: string;
  data: ReferenceData;
}
let cache: CacheSlot | null = null;

async function probeVersion(prisma: PrismaClient): Promise<string> {
  const agg = await prisma.patient.aggregate({
    where: { status: "archived", terminationReason: { not: null } },
    _count: { _all: true },
    _max: { archivedAt: true },
  });
  return `${agg._count._all}:${agg._max.archivedAt?.toISOString() ?? "-"}`;
}

async function build(prisma: PrismaClient, version: string): Promise<ReferenceData> {
  // Targets plus the alliance scales — the alliance series ride along on the
  // same lean load (pstb_adult responses are fetched anyway; sbkj_child adds
  // one id to the filter and has no simulated rows today).
  const wantedScales = [...PREDICTION_TARGETS, ...ALLIANCE_SERIES];
  const targetIds = Array.from(new Set(wantedScales.map((t) => t.instrumentId)));

  const instrumentRows = await prisma.instrument.findMany({
    where: { id: { in: targetIds } },
    include: { scales: true },
  });
  const scaleParamsByKey = new Map<string, ScaleParams>();
  for (const row of instrumentRows) {
    const def = instrumentFromRow(row);
    for (const t of wantedScales) {
      if (t.instrumentId !== def.id) continue;
      const scale = def.scales.find((s) => s.key === t.scaleKey);
      if (scale) scaleParamsByKey.set(seriesKeyOf(def.id, t.scaleKey), scaleParams(scale));
    }
  }

  // Lean load: labeled archived patients with ONLY the target-series scores.
  // No sessionNumber filter here — index-axis targets (BDI-FS) live on
  // wave-/date-based responses whose sessionNumber is null. The 3-field
  // sessionLogs select feeds the attendance features; the probe stays sound
  // without covering SessionLog writes because logs are only writable on
  // non-archived patients and archiving bumps archivedAt.
  const rows = await prisma.patient.findMany({
    where: { status: "archived", terminationReason: { not: null }, code: { not: null } },
    select: {
      code: true,
      simulated: true,
      demographics: true,
      disorderCategory: true,
      caseCharacteristics: true,
      terminationReason: true,
      treatmentEndAt: true,
      sessionLogs: { select: { type: true, occurredAt: true, sessionNumber: true } },
      responses: {
        where: { instrumentId: { in: targetIds } },
        select: {
          instrumentId: true,
          sessionNumber: true,
          occurredAt: true,
          scaleScores: { select: { value: true, scale: { select: { key: true, instrumentId: true } } } },
        },
      },
    },
  });

  const targetKeys = new Set(wantedScales.map((t) => `${t.instrumentId}|${t.scaleKey}`));
  const axisByKey = new Map<string, TargetAxis>(
    PREDICTION_TARGETS.map((t) => [seriesKeyOf(t.instrumentId, t.scaleKey), t.axis]),
  );
  const cases: ReferenceCase[] = rows.map((r) => {
    const series: Record<string, SessionPoint[]> = {};
    const bySessionKey = new Map<string, Map<number, { at: number; value: number }>>();
    const byIndexKey = new Map<string, { at: number; value: number }[]>();
    for (const resp of r.responses) {
      for (const sc of resp.scaleScores) {
        const key = `${sc.scale.instrumentId}|${sc.scale.key}`;
        if (!targetKeys.has(key)) continue;
        if (axisByKey.get(key) === "index") {
          const list = byIndexKey.get(key) ?? [];
          list.push({ at: resp.occurredAt.getTime(), value: sc.value });
          byIndexKey.set(key, list);
          continue;
        }
        if (resp.sessionNumber === null) continue;
        const m = bySessionKey.get(key) ?? new Map();
        const prev = m.get(resp.sessionNumber);
        // Duplicate session numbers keep the later record (same convention as
        // sessionSeriesOf over serialized responses).
        if (!prev || resp.occurredAt.getTime() >= prev.at)
          m.set(resp.sessionNumber, { at: resp.occurredAt.getTime(), value: sc.value });
        bySessionKey.set(key, m);
      }
    }
    for (const [key, m] of bySessionKey) {
      series[key] = Array.from(m.entries())
        .map(([session, { value }]) => ({ session, value }))
        .sort((a, b) => a.session - b.session);
    }
    for (const [key, list] of byIndexKey) {
      series[key] = list.sort((a, b) => a.at - b.at).map(({ value }, i) => ({ session: i, value }));
    }
    const primary = series[PRIMARY_KEY] ?? [];
    return {
      code: r.code!,
      simulated: r.simulated,
      features: intakeFeaturesOf({
        demographics: parseJson<Demographics>(r.demographics, {}),
        disorderCategory: r.disorderCategory,
        caseCharacteristics: parseJson<CaseCharacteristics>(r.caseCharacteristics, {}),
        baselineSeverity: baselineOf(primary),
      }),
      terminationReason: r.terminationReason,
      sessionCount: primary.length ? primary[primary.length - 1].session : null,
      treatmentEndAt: r.treatmentEndAt?.toISOString() ?? null,
      attendance: attendanceFeatures(
        r.sessionLogs,
        primary.map((p) => p.session),
      ),
      series,
    };
  });

  const primaryScale = scaleParamsByKey.get(PRIMARY_KEY);
  const dropoutModel = primaryScale ? trainDropoutModel(cases, PRIMARY_KEY, primaryScale) : null;

  const etrModels = new Map<string, EtrModel>();
  for (const t of PREDICTION_TARGETS) {
    // ETR is a log-linear model over the SESSION axis — meaningless on
    // measurement-index series, so index-axis targets get no ETR curve.
    if (t.axis === "index") continue;
    const key = seriesKeyOf(t.instrumentId, t.scaleKey);
    const model = trainEtr(
      cases
        .filter((c) => (c.series[key] ?? []).length >= 3)
        .map((c) => ({ features: c.features, series: c.series[key] })),
    );
    if (model) etrModels.set(key, model);
  }

  const allianceDeltas = new Map<string, number[]>();
  for (const s of ALLIANCE_SERIES) {
    const key = seriesKeyOf(s.instrumentId, s.scaleKey);
    const pool: number[] = [];
    for (const c of cases) for (const d of consecutiveDeltas(c.series[key] ?? [])) pool.push(d.delta);
    allianceDeltas.set(key, pool);
  }

  return {
    version,
    cases,
    includesSimulated: cases.some((c) => c.simulated),
    scaleParamsByKey,
    dropoutModel,
    etrModels,
    allianceDeltas,
  };
}

export async function getReferenceData(prisma: PrismaClient): Promise<ReferenceData> {
  const version = await probeVersion(prisma);
  if (cache && cache.version === version) return cache.data;
  const data = await build(prisma, version);
  cache = { version, data };
  return data;
}

/// Test/dev hook: drop the cache (e.g. after a manual reseed in the same process).
export function invalidateReferenceCache() {
  cache = null;
}
