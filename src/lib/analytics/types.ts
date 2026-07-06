// Shared shapes for the trajectory-analytics module (docs/outcome-prediction.md).
// Everything in src/lib/analytics/ is pure TypeScript over plain data — no
// prisma imports — so it is unit-testable and runs identically on real and
// simulated reference samples.
import type { ScaleDef } from "../instruments/types";
import { rciThreshold } from "../instruments/rci";
import type { ResponseRecord } from "../types";

/// One measured occasion of one scale on the session axis (0 = baseline).
export interface SessionPoint {
  session: number;
  value: number;
}

/// The scale facts the algorithms need, decoupled from ScaleDef so tests can
/// construct them directly. rciCutoff is the Jacobson & Truax reliable-change
/// threshold — null when the scale has no (verified or placeholder) rci
/// parameters, in which case RCI-based detection is SKIPPED, never guessed.
export interface ScaleParams {
  higherIsBetter: boolean;
  rciCutoff: number | null;
  range?: { min: number; max: number };
}

export function scaleParams(scale: ScaleDef): ScaleParams {
  return {
    higherIsBetter: scale.higherIsBetter ?? true,
    rciCutoff: scale.rci ? rciThreshold(scale.rci) : null,
    range: scale.range,
  };
}

/// Extract a patient's session-axis series for one (instrument, scale).
/// Duplicate session numbers keep the later record (responses arrive sorted by
/// occurredAt — see serialize.ts patientFromRow).
export function sessionSeriesOf(
  responses: ResponseRecord[],
  instrumentId: string,
  scaleKey: string,
): SessionPoint[] {
  const bySession = new Map<number, number>();
  for (const r of responses) {
    if (r.instrumentId !== instrumentId || r.sessionNumber === null) continue;
    const v = r.scores[scaleKey];
    if (typeof v === "number") bySession.set(r.sessionNumber, v);
  }
  return Array.from(bySession.entries())
    .map(([session, value]) => ({ session, value }))
    .sort((a, b) => a.session - b.session);
}

// --- Early change (Lutz: strongest process predictor of outcome) ---------------

export type EarlyChange = "early_response" | "early_deterioration" | "indeterminate";

// --- Sudden gains / losses (Tang & DeRubeis 1999; suddengains package) ---------

export interface SuddenShift {
  kind: "gain" | "loss";
  fromSession: number;
  toSession: number;
  /// Between-session change in ORIGINAL scale units (signed).
  delta: number;
  meanPre: number;
  meanPost: number;
  nPre: number;
  nPost: number;
  criticalValue: number;
  pooledSd: number;
}

// --- Expected course / failure boundary ----------------------------------------

export interface ExpectedCoursePoint {
  session: number;
  /// Reference cases measured at this session — displayed with the band, and
  /// the honesty gate: occasions below minN are not drawn at all.
  n: number;
  p25: number;
  p50: number;
  p75: number;
}

export interface OnTrackResult {
  status: "on_track" | "not_on_track" | "unknown";
  reasons: ("below_band" | "rci_deterioration")[];
}

// --- Intake features (the classic ETR predictor set + demographics) ------------

export interface IntakeFeatures {
  age: number | null;
  /// Canonical stored value ("Male" | "Female" | ...) or null.
  sex: string | null;
  disorderCategory: string | null;
  /// First measured value of the primary symptom scale (severity orientation
  /// is NOT applied here — this is the raw scale value).
  baselineSeverity: number | null;
  /// Ordinal chronicity: 0 = <6m, 1 = 6–24m, 2 = >24m.
  problemDuration: 0 | 1 | 2 | null;
  priorPsychotherapy: boolean | null;
  psychotropicMedication: boolean | null;
  employment: string | null;
  treatmentExpectation: number | null;
}

/// One completed (archived + labeled) treatment in the reference sample.
export interface ReferenceCase {
  /// Research pseudonym — the ONLY identifier that leaves the server.
  code: string;
  simulated: boolean;
  features: IntakeFeatures;
  terminationReason: string | null;
  /// Total measured sessions (max sessionNumber of the primary series).
  sessionCount: number | null;
  /// Series keyed "instrumentId|scaleKey".
  series: Record<string, SessionPoint[]>;
}

export const seriesKeyOf = (instrumentId: string, scaleKey: string) => `${instrumentId}|${scaleKey}`;
