// Caseload scoping for staff access to a single patient record.
//
// The write routes always checked "director or assigned therapist"; the READ
// surfaces (clinic payload, GET /api/patients/[id], predictions, DIPS, …)
// relied on the client filtering its lists — any therapist could fetch any
// dossier over the API. This helper is the single server-side rule:
//   director  → every patient
//   therapist → only their own caseload (patient.therapistId === session.id)
//   admin     → handled separately (lite view, no clinical data)
//   patient   → handled separately (own record only)
import type { Role, SessionUser } from "./types";

/// Clinical staff — the only roles that may read clinical data (scores,
/// trajectories, diagnoses, predictions, dossiers). Routes gate on this
/// ALLOW-list rather than denying patient/admin: any role added later (the
/// intern, Batch 16) is refused by default instead of falling through to the
/// full clinical payload.
export function isClinicalRole(role: Role | string): role is "director" | "therapist" {
  return role === "director" || role === "therapist";
}

export function therapistScoped(
  s: SessionUser,
  patient: { therapistId: string | null },
): boolean {
  if (s.role === "director") return true;
  if (s.role === "therapist") return patient.therapistId === s.id;
  return false;
}
