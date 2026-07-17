// Pure session-number logic (client-safe, like reminders.ts): the ledger UI
// suggests the next session number when a held session is logged. The number
// stays editable — this is a suggestion, not an enforced sequence.
import { isOpenInvitation } from "./reminders";

interface SessionNumberSources {
  sessionLogs: { type: string; sessionNumber: number | null }[];
  responses: { sessionNumber: number | null }[];
  invitations: { status: string; context: { sessionNumber?: number } }[];
}

/// Highest session number known for a patient, from three sources:
/// - held ledger entries (authoritative going forward),
/// - responses (transition period: existing patients have measurement history
///   with sessionNumbers but no ledger rows yet),
/// - OPEN invitations' context (a pending send for session 10 must not lead to
///   10 being suggested again). Terminal-but-unanswered invitations
///   (cancelled / no_response / error) are deliberately ignored: their session
///   is either covered by its ledger row or was a mistake.
/// Returns null when nothing is numbered yet.
export function maxKnownSessionNumber(p: SessionNumberSources): number | null {
  let max: number | null = null;
  const consider = (n: number | null | undefined) => {
    if (typeof n === "number" && Number.isFinite(n) && (max === null || n > max)) max = n;
  };
  for (const log of p.sessionLogs) if (log.type === "held") consider(log.sessionNumber);
  for (const r of p.responses) consider(r.sessionNumber);
  for (const inv of p.invitations) if (isOpenInvitation(inv.status)) consider(inv.context.sessionNumber);
  return max;
}

/// Suggested number for the next held session: max known + 1, or 1 for a
/// patient with no numbered history (session 0 is the pre-therapy baseline).
export function suggestNextSessionNumber(p: SessionNumberSources): number {
  const max = maxKnownSessionNumber(p);
  return max === null ? 1 : max + 1;
}
