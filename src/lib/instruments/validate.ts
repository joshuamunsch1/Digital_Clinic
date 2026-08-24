// Submission validation against an instrument definition (pure, client-safe).
//
// Guards the direct API submission path (in-app patient forms, therapist
// manual entry), which used to store `rawAnswers` verbatim — {PHQ1: 99} would
// score a PHQ_total of 99 against 0–12 norm bands. Unknown item ids and
// out-of-range values are REJECTED, not stored. (The CSV/LimeSurvey import
// path filters unknown ids via extractRawAnswers instead.)
import type { InstrumentDef } from "./types";

export interface AnswerValidation {
  ok: boolean;
  /// Per-item problems, e.g. "PHQ1: value 99 above maximum 3".
  problems: string[];
}

export function validateRawAnswers(def: InstrumentDef, raw: Record<string, unknown>): AnswerValidation {
  const items = new Map(def.items.map((i) => [i.id, i]));
  const problems: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const item = items.get(key);
    if (!item) {
      problems.push(`${key}: unknown item`);
      continue;
    }
    if (value === null || value === undefined || value === "") continue; // missing is legal
    if (item.responseType === "text") continue;
    if (item.responseType === "categorical") {
      const v = String(value);
      const known = (item.options ?? []).includes(v) || (item.valueMap ? v in item.valueMap : false);
      if (!known) problems.push(`${key}: '${v}' is not one of the defined options`);
      continue;
    }
    // likert / number: must be numeric and inside the defined range
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) {
      problems.push(`${key}: not a number`);
      continue;
    }
    if (item.min !== undefined && n < item.min) problems.push(`${key}: value ${n} below minimum ${item.min}`);
    else if (item.max !== undefined && n > item.max) problems.push(`${key}: value ${n} above maximum ${item.max}`);
  }
  return { ok: problems.length === 0, problems };
}
