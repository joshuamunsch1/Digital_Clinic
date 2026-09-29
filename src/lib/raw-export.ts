// Item-level raw-data export of one instrument for one patient (Batch 16):
// the dossier's "Rohdaten (CSV)" download. Pure and client-safe — built from
// the already-loaded dossier payload, no extra route. Pseudonymous by
// construction: the patient appears as their research code only (the file
// name too), and free-text respondent notes are left out because they can
// carry identifying content.
import { csvDocument } from "./csv";
import type { InstrumentDef } from "./instruments/types";
import type { ResponseRecord } from "./types";

export function rawDataCsv(instrument: InstrumentDef, responses: ResponseRecord[], patientCode: string | null): string {
  const itemIds = instrument.items.length
    ? instrument.items.map((i) => i.id)
    : Array.from(new Set(responses.flatMap((r) => Object.keys(r.rawAnswers)))).sort();
  const scaleKeys = instrument.scales.map((s) => s.key);
  const header = [
    "patient_code",
    "instrument",
    "occurred_at",
    "session_number",
    "wave",
    "respondent_role",
    "source",
    ...itemIds,
    ...scaleKeys,
  ];
  const rows = [...responses]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .map((r) => [
      patientCode ?? "",
      instrument.id,
      r.occurredAt.slice(0, 10),
      r.sessionNumber,
      r.wave,
      r.respondentRole,
      r.source,
      ...itemIds.map((id) => {
        const v = r.rawAnswers[id];
        return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;
      }),
      ...scaleKeys.map((k) => r.scores[k]),
    ]);
  return csvDocument(header, rows);
}

/// File name for the download: code + instrument, never the patient's name.
export function rawDataFileName(instrument: InstrumentDef, patientCode: string | null): string {
  return `${patientCode ?? "ohne-code"}_${instrument.id}_rohdaten.csv`;
}
