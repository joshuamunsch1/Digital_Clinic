// Server-side FHIR delivery. The clinic database is the system of record;
// if FHIR_RELAY_URL is set, the QuestionnaireResponse is also forwarded there.
import type { QuestionnaireResponse } from "./dips/fhir";

export const endpointLabel = () =>
  process.env.FHIR_RELAY_URL || "clinic database (no external relay)";

export async function relay(
  fhir: QuestionnaireResponse,
): Promise<{ status: "sent" | "local"; httpStatus?: number }> {
  const url = process.env.FHIR_RELAY_URL;
  if (!url) return { status: "sent" }; // stored locally; nothing to relay
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/fhir+json" },
      body: JSON.stringify(fhir),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok
      ? { status: "sent", httpStatus: res.status }
      : { status: "local", httpStatus: res.status };
  } catch {
    return { status: "local" };
  }
}
