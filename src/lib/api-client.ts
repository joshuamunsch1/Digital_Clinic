// Frontend API client — thin typed wrappers over the route handlers.
import type { Lang } from "./i18n";
import type {
  ClinicData,
  Demographics,
  DipsAnswers,
  Patient,
  SessionUser,
} from "./types";
import type { InstrumentDef, RawAnswers } from "./instruments/types";

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

export const api = {
  getSession: () => fetch("/api/auth").then((r) => handle<{ user: SessionUser | null }>(r)),
  login: (email: string, password: string) =>
    post("/api/auth", { email, password }).then((r) => handle<{ user: SessionUser }>(r)),
  register: (payload: RegisterRequest) =>
    post("/api/register", payload).then((r) => handle<{ user: SessionUser }>(r)),
  logout: () => fetch("/api/auth", { method: "DELETE" }).then((r) => handle<{ ok: boolean }>(r)),

  getClinic: () => fetch("/api/clinic").then((r) => handle<ClinicData>(r)),
  getPatient: (id: string) => fetch(`/api/patients/${id}`).then((r) => handle<{ patient: Patient }>(r)),
  registerPatient: (name: string) => post("/api/patients", { name }).then((r) => handle<{ patient: Patient }>(r)),

  getInstruments: () => fetch("/api/instruments").then((r) => handle<{ instruments: InstrumentDef[] }>(r)),
  linkInstrumentSurvey: (id: string, limesurveySurveyId: string | null) =>
    patch(`/api/instruments/${id}`, { limesurveySurveyId }).then((r) => handle<{ instrument: InstrumentDef }>(r)),

  submitAssessment: (
    id: string,
    demo: Demographics,
    dips: { lang: Lang; answers: DipsAnswers; completedAt: string },
  ) => post(`/api/patients/${id}/assessment`, { demo, dips }).then((r) => handle<{ patient: Patient }>(r)),

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
    post(`/api/patients/${id}/invitations`, payload).then((r) => handle<{ patient: Patient }>(r)),

  remindInvitation: (invitationId: string) =>
    patch(`/api/invitations/${invitationId}`, { action: "remind" }).then((r) => handle<{ patient: Patient }>(r)),

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

  saveDiagnosis: (id: string, text: string, category: string) =>
    patch(`/api/patients/${id}`, { action: "diagnose", text, category }).then((r) => handle<{ patient: Patient }>(r)),

  savePatientEmail: (id: string, email: string) =>
    patch(`/api/patients/${id}`, { action: "contact", email }).then((r) => handle<{ patient: Patient }>(r)),

  assignTherapist: (id: string, therapistId: string | null) =>
    patch(`/api/patients/${id}`, { action: "assign", therapistId }).then((r) => handle<{ patient: Patient }>(r)),

  resetDemo: () => post("/api/seed").then((r) => handle<{ ok: boolean }>(r)),
};
