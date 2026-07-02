// Frontend API client — thin typed wrappers over the route handlers.
import type { Lang } from "./i18n";
import type {
  ClinicData,
  Demographics,
  DipsAnswers,
  Patient,
  Role,
  SessionUser,
  LoginRoster,
} from "./types";
import type { Scores } from "./wellbeing";

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

export const api = {
  getSession: () => fetch("/api/auth").then((r) => handle<{ user: SessionUser | null }>(r)),
  getRoster: () => fetch("/api/roster").then((r) => handle<LoginRoster>(r)),
  login: (role: Role, id: string) => post("/api/auth", { role, id }).then((r) => handle<{ user: SessionUser }>(r)),
  logout: () => fetch("/api/auth", { method: "DELETE" }).then((r) => handle<{ ok: boolean }>(r)),

  getClinic: () => fetch("/api/clinic").then((r) => handle<ClinicData>(r)),
  getPatient: (id: string) => fetch(`/api/patients/${id}`).then((r) => handle<{ patient: Patient }>(r)),
  registerPatient: (name: string) => post("/api/patients", { name }).then((r) => handle<{ patient: Patient }>(r)),

  submitAssessment: (
    id: string,
    demo: Demographics,
    dips: { lang: Lang; answers: DipsAnswers; completedAt: string },
  ) => post(`/api/patients/${id}/assessment`, { demo, dips }).then((r) => handle<{ patient: Patient }>(r)),

  resendDips: (id: string) =>
    fetch(`/api/patients/${id}/assessment`, { method: "PUT" }).then((r) => handle<{ patient: Patient }>(r)),

  submitWellbeing: (id: string, scores: Scores, note: string) =>
    post(`/api/patients/${id}/wellbeing`, { scores, note }).then((r) => handle<{ patient: Patient }>(r)),

  saveDiagnosis: (id: string, text: string) =>
    patch(`/api/patients/${id}`, { action: "diagnose", text }).then((r) => handle<{ patient: Patient }>(r)),

  assignTherapist: (id: string, therapistId: string | null) =>
    patch(`/api/patients/${id}`, { action: "assign", therapistId }).then((r) => handle<{ patient: Patient }>(r)),

  resetDemo: () => post("/api/seed").then((r) => handle<{ ok: boolean }>(r)),
};
