// Alliance-rupture detection on session-by-session alliance scores (PSTB /
// SBKJ "Therapiebeziehung"). Session-to-session drops in patient-rated
// alliance are a validated rupture proxy (e.g. Eubanks et al.; Zilcha-Mano's
// session-by-session work) — the signal a therapist can act on next session.
//
// Criterion hierarchy (NO fabricated psychometrics):
//   1. RCI, when the scale has (real) rci parameters — activates automatically
//      the day the clinic supplies Therapiebeziehung reliability/SD values.
//   2. Empirical: the worsening-tail percentile of the reference cohort's own
//      consecutive-session alliance deltas (default p05 tail, min 30 deltas) —
//      the same epistemics as the expected-course bands: an observed reference
//      quantity, reported with its n. The tail probability is a clinical
//      choice, not a derived constant [clinician-confirm].
//   3. Neither → criterion null, NO ruptures — never a hand-picked raw cutoff.
import { percentile } from "./stats";
import type { ScaleParams, SessionPoint } from "./types";

export interface ConsecutiveDelta {
  from: number;
  to: number;
  /// Signed, original scale units (to − from).
  delta: number;
}

export interface AllianceRupture {
  fromSession: number;
  toSession: number;
  /// Signed between-session change in ORIGINAL scale units.
  delta: number;
  threshold: number;
  criterion: "rci" | "empirical";
}

export interface AllianceSignal {
  ruptures: AllianceRupture[];
  /// null = honestly skipped (no rci, insufficient reference deltas).
  criterion: "rci" | "empirical" | null;
  /// Worsening magnitude a transition must reach (original scale units).
  threshold: number | null;
  /// Reference transitions behind an empirical threshold; null for rci.
  referenceN: number | null;
  /// The transition into the most recent session is a rupture — the "act on
  /// it next session" flag.
  latestIsRupture: boolean;
}

/// Strictly consecutive session transitions (n → n+1) only — a delta across a
/// gap (S5 → S7) conflates two sessions' worth of change (mirrors the
/// sudden-shift convention). Input order does not matter.
export function consecutiveDeltas(series: SessionPoint[]): ConsecutiveDelta[] {
  const sorted = [...series].sort((a, b) => a.session - b.session);
  const out: ConsecutiveDelta[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].session !== sorted[i - 1].session + 1) continue;
    out.push({ from: sorted[i - 1].session, to: sorted[i].session, delta: sorted[i].value - sorted[i - 1].value });
  }
  return out;
}

export interface AllianceOptions {
  /// Minimum pooled reference deltas for the empirical criterion.
  minN?: number;
  /// Worsening-tail probability [clinician-confirm].
  pct?: number;
}

/// Threshold (worsening magnitude, > 0) from pooled reference deltas already
/// mapped to WORSENING orientation (positive = alliance got worse). Null when
/// under the n gate or when the tail percentile is not an actual worsening —
/// a cohort where almost nothing worsens cannot calibrate a rupture cutoff.
export function empiricalRuptureThreshold(
  worseningDeltas: number[],
  opts: AllianceOptions = {},
): number | null {
  const minN = opts.minN ?? 30;
  const pct = opts.pct ?? 0.05;
  if (worseningDeltas.length < minN) return null;
  const threshold = percentile(worseningDeltas, 1 - pct);
  return threshold > 0 ? threshold : null;
}

export function detectAllianceRuptures(
  series: SessionPoint[],
  scale: ScaleParams,
  /// Pooled reference-cohort consecutive-session deltas, SIGNED in original
  /// scale units (same orientation as the patient's series).
  referenceDeltas: number[],
  opts: AllianceOptions = {},
): AllianceSignal {
  // Worsening orientation: positive = alliance deteriorated.
  const worsening = (delta: number) => (scale.higherIsBetter ? -delta : delta);

  let criterion: "rci" | "empirical" | null = null;
  let threshold: number | null = null;
  let referenceN: number | null = null;
  if (scale.rciCutoff !== null) {
    criterion = "rci";
    threshold = scale.rciCutoff;
  } else {
    const t = empiricalRuptureThreshold(referenceDeltas.map(worsening), opts);
    if (t !== null) {
      criterion = "empirical";
      threshold = t;
      referenceN = referenceDeltas.length;
    }
  }
  if (criterion === null || threshold === null) {
    return { ruptures: [], criterion: null, threshold: null, referenceN: null, latestIsRupture: false };
  }

  const deltas = consecutiveDeltas(series);
  const ruptures: AllianceRupture[] = deltas
    .filter((d) => worsening(d.delta) >= threshold!)
    .map((d) => ({ fromSession: d.from, toSession: d.to, delta: d.delta, threshold: threshold!, criterion: criterion! }));
  const last = deltas.length ? deltas[deltas.length - 1] : null;

  return {
    ruptures,
    criterion,
    threshold,
    referenceN,
    latestIsRupture: last !== null && worsening(last.delta) >= threshold,
  };
}
