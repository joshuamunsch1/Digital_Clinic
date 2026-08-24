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
import type { SessionUser } from "./types";

export function therapistScoped(
  s: SessionUser,
  patient: { therapistId: string | null },
): boolean {
  if (s.role === "director") return true;
  if (s.role === "therapist") return patient.therapistId === s.id;
  return false;
}
