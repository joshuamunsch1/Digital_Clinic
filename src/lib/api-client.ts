// Frontend API client — thin typed wrappers over the route handlers.
import type { Lang } from "./i18n";
import type {
  CaseCharacteristics,
  ClinicData,
  Demographics,
  DipsAnswers,
  Patient,
  SessionUser,
} from "./types";
import type { InstrumentDef, RawAnswers } from "./instruments/types";
// Type-only imports — erased at compile time, no server code in the bundle.
import type { PredictionPayload, PredictionSummary } from "./prediction/service";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const patch = (url: string, body: unknown) =>
  fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export interface SubmitResponsePayload {
  instrumentId: string;
  rawAnswers: RawAnswers;
  respondentRole?: string;
  sessionNumber?: number | null;
  wave?: string | null;
  occurredAt?: string;
  note?: string;
  invitationId?: string; // when this submission answers an in-app task
  conductedById?: string | null;
}

export interface ImportCsvPayload {
  instrumentId: string;
  csv: string;
  respondentRole?: string;
  wave?: string | null;
  sessionNumber?: number | null;
  occurredAt?: string;
}

export interface CreateInvitationPayload {
  instrumentId: string;
  respondentRole?: string;
  email?: string;
  wave?: string;
  sessionNumber?: number;
  surveyId?: string;
  channel?: "limesurvey" | "in_app";
  remindEveryDays?: number;
  maxReminders?: number;
}

export interface SweepResult {
  skipped?: string;
  sync?: { checked: number; imported: number; pending: number; errors: string[] };
  reminders?: { due: number; sent: number; errors: string[] };
}

export const documentDownloadUrl = (documentId: string) => `/api/documents/${documentId}`;

export interface UpdateDocumentPayload {
  title?: string;
  occurredAt?: string;
  note?: string;
  docType?: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  demographics: Demographics;
}

/// Manual registration by director/administrator (no password — the patient
/// receives credentials later).
export interface RegisterPatientPayload {
  name: string;
  email?: string;
  demographics?: Demographics;
}

/// Result of the best-effort filesystem export performed by the archive action.
export interface ArchiveExportInfo {
  ok: boolean;
  dir?: string;
  error?: string;
}

export const api = {
  getSession: () => fetch("/api/auth").then((r) => handle<{ user: SessionUser | null }>(r)),
  login: (email: string, password: string) =>
    post("/api/auth", { email, password }).then((r) => handle<{ user: SessionUser }>(r)),
  register: (payload: RegisterRequest) =>
    post("/api/register", payload).then((r) => handle<{ user: SessionUser }>(r)),
  logout: () => fetch("/api/auth", { method: "DELETE" }).then((r) => handle<{ ok: boolean }>(r)),

  getClinic: () => fetch("/api/clinic").then((r) => handle<ClinicData>(r)),
  getPatient: (id: string) => fetch(`/api/patients/${id}`).then((r) => handle<{ patient: Patient }>(r)),
  registerPatient: (payload: RegisterPatientPayload) =>
    post("/api/patients", payload).then((r) => handle<{ patient: Patient }>(r)),

  getInstruments: () => fetch("/api/instruments").then((r) => handle<{ instruments: InstrumentDef[] }>(r)),
  linkInstrumentSurvey: (id: string, limesurveySurveyId: string | null) =>
    patch(`/api/instruments/${id}`, { limesurveySurveyId }).then((r) => handle<{ instrument: InstrumentDef }>(r)),

  submitAssessment: (id: string, demo: Demographics) =>
    post(`/api/patients/${id}/assessment`, { demo }).then((r) => handle<{ patient: Patient }>(r)),

  /// Therapist-administered DIPS interview (staff-only).
  submitDips: (id: string, dips: { lang: Lang; answers: DipsAnswers; completedAt: string }) =>
    post(`/api/patients/${id}/dips`, { dips }).then((r) => handle<{ patient: Patient }>(r)),

  resendDips: (id: string) =>
    fetch(`/api/patients/${id}/assessment`, { method: "PUT" }).then((r) => handle<{ patient: Patient }>(r)),

  submitResponse: (id: string, payload: SubmitResponsePayload) =>
    post(`/api/patients/${id}/responses`, payload).then((r) =>
      handle<{ patient: Patient; skippedScales: { key: string; reason: string }[] }>(r),
    ),

  importCsv: (id: string, payload: ImportCsvPayload) =>
    post(`/api/patients/${id}/import`, payload).then((r) =>
      handle<{ patient: Patient; imported: number; warnings: string[] }>(r),
    ),

  createInvitation: (id: string, payload: CreateInvitationPayload) =>
    post(`/api/patients/${id}/invitations`, payload).then((r) => handle<{ patient: Patient; warning?: string }>(r)),

  remindInvitation: (invitationId: string) =>
    patch(`/api/invitations/${invitationId}`, { action: "remind" }).then((r) => handle<{ patient: Patient }>(r)),

  scheduleInvitation: (invitationId: string, remindEveryDays: number | null, maxReminders: number | null) =>
    patch(`/api/invitations/${invitationId}`, { action: "schedule", remindEveryDays, maxReminders }).then((r) =>
      handle<{ patient: Patient }>(r),
    ),

  cancelInvitation: (invitationId: string) =>
    patch(`/api/invitations/${invitationId}`, { action: "cancel" }).then((r) => handle<{ patient: Patient }>(r)),

  runReminderSweep: () => post("/api/reminders/run").then((r) => handle<SweepResult>(r)),

  syncLimesurvey: (patientId?: string) =>
    post("/api/limesurvey/sync", patientId ? { patientId } : {}).then((r) =>
      handle<{ checked: number; imported: number; pending: number; errors: string[] }>(r),
    ),

  // Document timeline. Upload is multipart (fields: docType, title?, occurredAt?,
  // note?, and file OR template="true") — no Content-Type header so the browser
  // sets the boundary. Downloads go through a plain <a href>, not fetch.
  uploadDocument: (patientId: string, form: FormData) =>
    fetch(`/api/patients/${patientId}/documents`, { method: "POST", body: form }).then((r) =>
      handle<{ patient: Patient }>(r),
    ),
  updateDocument: (documentId: string, payload: UpdateDocumentPayload) =>
    patch(`/api/documents/${documentId}`, payload).then((r) => handle<{ patient: Patient }>(r)),
  deleteDocument: (documentId: string) =>
    fetch(`/api/documents/${documentId}`, { method: "DELETE" }).then((r) => handle<{ patient: Patient }>(r)),

  saveDiagnosis: (id: string, text: string, category: string, icdCode?: string) =>
    patch(`/api/patients/${id}`, { action: "diagnose", text, category, icdCode }).then((r) => handle<{ patient: Patient }>(r)),

  saveCaseCharacteristics: (id: string, characteristics: CaseCharacteristics) =>
    patch(`/api/patients/${id}`, { action: "caseCharacteristics", characteristics }).then((r) =>
      handle<{ patient: Patient }>(r),
    ),

  savePatientEmail: (id: string, email: string) =>
    patch(`/api/patients/${id}`, { action: "contact", email }).then((r) => handle<{ patient: Patient }>(r)),

  assignTherapist: (id: string, therapistId: string | null) =>
    patch(`/api/patients/${id}`, { action: "assign", therapistId }).then((r) => handle<{ patient: Patient }>(r)),

  logSession: (id: string, payload: { occurredAt?: string; type: string; conductedById?: string | null; note?: string }) =>
    post(`/api/patients/${id}/session-log`, payload).then((r) => handle<{ patient: Patient }>(r)),

  deleteSessionLog: (logId: string) =>
    fetch(`/api/session-logs/${logId}`, { method: "DELETE" }).then((r) => handle<{ patient: Patient }>(r)),

  /// terminationReason is required — the server rejects unlabeled conclusions
  /// (docs/outcome-prediction.md §4.2).
  archivePatient: (id: string, terminationReason: string) =>
    patch(`/api/patients/${id}`, { action: "archive", terminationReason }).then((r) =>
      handle<{ patient: Patient; archiveExport?: ArchiveExportInfo }>(r),
    ),

  unarchivePatient: (id: string) =>
    patch(`/api/patients/${id}`, { action: "unarchive" }).then((r) => handle<{ patient: Patient }>(r)),

  /// Therapist-facing outcome prediction (staff-only; 403 for patients/admin).
  getPrediction: (id: string) =>
    fetch(`/api/patients/${id}/prediction`).then((r) => handle<{ prediction: PredictionPayload }>(r)),

  getPredictionSummaries: () =>
    fetch("/api/predictions/summary").then((r) => handle<{ summaries: Record<string, PredictionSummary> }>(r)),

  resetDemo: () => post("/api/seed").then((r) => handle<{ ok: boolean }>(r)),
};
