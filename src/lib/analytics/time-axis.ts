// Calendar-time helpers for trajectories (Batch 16). Pure and client-safe:
// the SAME binning runs on the server (reference cohort + patient series for
// the weeks-axis prediction target) and in the charts, so a band point drawn
// at "week 6" is exactly the week the analytics compared against.
//
// Why: measurement intervals differ widely between patients (weekly vs.
// monthly appointments). Every-session measures stay dose-indexed by session
// number (the Lutz expected-course convention) but are DRAWN on a calendar
// axis; date-cadenced instruments (BDI-FS) are aligned by weeks since therapy
// start instead of by measurement count — "the 2nd BDI-FS" is week 1 for one
// patient and mid-therapy for another.
import type { SessionPoint } from "./types";

export const DAY_MS = 864e5;
export const WEEK_MS = 7 * DAY_MS;

interface Measured {
  instrumentId: string;
  occurredAt: string;
  scores: Record<string, number>;
}

const toMs = (d: string | Date | null | undefined): number | null => {
  if (d === null || d === undefined) return null;
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  return Number.isFinite(t) ? t : null;
};

/// Day 0 of a patient's weeks axis: the therapy start (set when the diagnosis
/// is recorded), else the first measurement of the series.
export function seriesAnchor(treatmentStartAt: string | Date | null | undefined, firstAt: number | null): number | null {
  return toMs(treatmentStartAt) ?? firstAt;
}

/// Whole weeks since the anchor. Measurements before the therapy start (intake
/// questionnaires) count as week 0 — the baseline.
export function weeksSince(anchorMs: number, atMs: number): number {
  return Math.max(0, Math.floor((atMs - anchorMs) / WEEK_MS));
}

/// Earliest occurrence of a scored value of (instrument, scale), or null.
export function firstMeasurementAt(responses: Measured[], instrumentId: string, scaleKey: string): number | null {
  let first: number | null = null;
  for (const r of responses) {
    if (r.instrumentId !== instrumentId || typeof r.scores[scaleKey] !== "number") continue;
    const t = Date.parse(r.occurredAt);
    if (first === null || t < first) first = t;
  }
  return first;
}

/// Bin timestamped values into a weeks-since-anchor series. Several values in
/// one week keep the LATEST (same convention as duplicate session numbers).
export function binByWeek(points: { at: number; value: number }[], anchorMs: number): SessionPoint[] {
  const byWeek = new Map<number, { at: number; value: number }>();
  for (const p of points) {
    const w = weeksSince(anchorMs, p.at);
    const prev = byWeek.get(w);
    if (!prev || p.at >= prev.at) byWeek.set(w, p);
  }
  return Array.from(byWeek.entries())
    .map(([session, { value }]) => ({ session, value }))
    .sort((a, b) => a.session - b.session);
}

/// A patient's weeks-axis series for one (instrument, scale). `session` holds
/// the week so every downstream algorithm (bands, NOT flag) works unchanged.
export function weekSeriesOf(responses: Measured[], instrumentId: string, scaleKey: string, anchorMs: number): SessionPoint[] {
  return binByWeek(
    responses
      .filter((r) => r.instrumentId === instrumentId && typeof r.scores[scaleKey] === "number")
      .map((r) => ({ at: Date.parse(r.occurredAt), value: r.scores[scaleKey] })),
    anchorMs,
  );
}

/// Known calendar dates of numbered sessions: the earliest response carrying
/// that session number, else the held ledger entry's date.
export function sessionDateMap(
  responses: { sessionNumber: number | null; occurredAt: string }[],
  sessionLogs: { type: string; sessionNumber: number | null; occurredAt: string }[] = [],
): Map<number, number> {
  const known = new Map<number, number>();
  for (const r of responses) {
    if (r.sessionNumber === null) continue;
    const t = Date.parse(r.occurredAt);
    const prev = known.get(r.sessionNumber);
    if (prev === undefined || t < prev) known.set(r.sessionNumber, t);
  }
  for (const l of sessionLogs) {
    if (l.type !== "held" || l.sessionNumber === null || known.has(l.sessionNumber)) continue;
    known.set(l.sessionNumber, Date.parse(l.occurredAt));
  }
  return known;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/// Typical time per session step from the most recent (≤5) consecutive known
/// sessions — the patient's own rhythm; one week when unknown.
export function sessionStepMs(known: Map<number, number>): number {
  const sessions = Array.from(known.keys()).sort((a, b) => a - b);
  const steps: number[] = [];
  for (let i = 1; i < sessions.length; i++) {
    const gap = sessions[i] - sessions[i - 1];
    const dt = known.get(sessions[i])! - known.get(sessions[i - 1])!;
    if (gap > 0 && dt > 0) steps.push(dt / gap);
  }
  return steps.length ? median(steps.slice(-5)) : WEEK_MS;
}

/// Calendar position of session k: known → exact; between two known sessions
/// → linear interpolation; beyond the last known session → projected at the
/// patient's recent rhythm (flagged — the chart labels these "geplant").
/// Null when the patient has no dated session at all.
export function dateForSession(known: Map<number, number>, k: number): { t: number; projected: boolean } | null {
  const exact = known.get(k);
  if (exact !== undefined) return { t: exact, projected: false };
  const sessions = Array.from(known.keys()).sort((a, b) => a - b);
  if (!sessions.length) return null;
  const step = sessionStepMs(known);
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  if (k > last) return { t: known.get(last)! + (k - last) * step, projected: true };
  if (k < first) return { t: known.get(first)! - (first - k) * step, projected: false };
  let lo = first;
  let hi = last;
  for (const s of sessions) {
    if (s < k) lo = s;
    if (s > k) {
      hi = s;
      break;
    }
  }
  const tLo = known.get(lo)!;
  const tHi = known.get(hi)!;
  return { t: tLo + ((tHi - tLo) * (k - lo)) / (hi - lo), projected: false };
}

/// Spacing between consecutive measurements in days (median, min, max) — the
/// chart caption that makes a patient's measurement rhythm explicit.
export function intervalStats(times: number[]): { medianDays: number; minDays: number; maxDays: number } | null {
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const days = sorted.slice(1).map((t, i) => (t - sorted[i]) / DAY_MS);
  return {
    medianDays: Math.round(median(days)),
    minDays: Math.round(Math.min(...days)),
    maxDays: Math.round(Math.max(...days)),
  };
}
