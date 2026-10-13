// Submission validation for the DIPS interview (pure, client-safe) — the
// counterpart of instruments/validate.ts for the structured-interview engine.
//
// POST /api/patients/[id]/dips used to store whatever JSON arrived and derive
// diagnosis proposals from it. A submission is now reduced to the answer keys
// the schema defines (per module), type-checked, stripped of everything the
// skip logic hides, and must be complete — the same rule the form enforces.
import type { DipsAnswers, ModuleAnswers } from "../types";
import { inkKey } from "../ink";
import { effectiveModule, gridRows, moduleComplete } from "./engine";
import { MODULES } from "./schema";
import type { Item } from "./types";

type Check = (v: unknown) => boolean;

const TEXT_MAX = 5_000;
const INK_MAX = 600_000; // serialized stroke data of one handwritten note

const yesNo: Check = (v) => v === "yes" || v === "no";
const bool: Check = (v) => typeof v === "boolean";
const text = (max: number): Check => (v) => typeof v === "string" && v.length <= max;
const intIn = (lo: number, hi: number): Check => (v) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
/// Number inputs arrive as the typed string; seeded records hold numbers.
const numeric: Check = (v) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 12 && (v.trim() === "" || Number.isFinite(Number(v))));

function keyChecks(item: Item): [string, Check][] {
  const short = text(TEXT_MAX);
  switch (item.type) {
    case "subhead":
      return [];
    case "yesno":
      return [[item.id, yesNo], ...(item.checks ?? []).map((c): [string, Check] => [`${item.id}_${c.key}`, bool])];
    case "yesno_text":
      return [[item.id, yesNo], [`${item.id}_text`, short], [inkKey(`${item.id}_text`), text(INK_MAX)]];
    case "textarea":
      return [[item.id, short], [inkKey(item.id), text(INK_MAX)]];
    case "monthyear_range":
      return [[`${item.id}_from`, text(40)], [`${item.id}_to`, text(40)]];
    case "dual_scale":
      return (item.parts ?? []).map((p): [string, Check] => [`${item.id}_${p.key}`, intIn(0, 8)]);
    case "number_label":
      return [[item.id, numeric]];
    case "grid":
      return gridRows(item).flatMap((r) => [
        [`${item.id}_${r.key}_primary`, yesNo] as [string, Check],
        ...(item.cols ?? []).map((c): [string, Check] => [`${item.id}_${r.key}_${c.key}`, c.kind === "yesno" ? yesNo : intIn(0, 3)]),
        ...(r.specify ? [[`${item.id}_${r.key}_spec`, text(200)] as [string, Check]] : []),
      ]);
    default:
      return [[item.id, text(item.type === "date" ? 40 : TEXT_MAX)]]; // text, date
  }
}

export type DipsValidation =
  | { ok: true; answers: DipsAnswers }
  | { ok: false; error: "invalid_answers" | "dips_incomplete"; problems: string[] };

export function validateDipsSubmission(raw: unknown): DipsValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, error: "invalid_answers", problems: ["answers: not an object"] };
  const problems: string[] = [];
  const answers: DipsAnswers = {};
  for (const mod of MODULES) {
    const given = (raw as Record<string, unknown>)[mod.id];
    if (given !== undefined && (!given || typeof given !== "object" || Array.isArray(given))) {
      problems.push(`${mod.id}: not an object`);
      continue;
    }
    const checks = new Map(mod.sections.flatMap((s) => s.items).flatMap(keyChecks));
    const m: ModuleAnswers = {};
    for (const [key, value] of Object.entries((given ?? {}) as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      const check = checks.get(key);
      if (!check) problems.push(`${mod.id}.${key}: unknown item`);
      else if (!check(value)) problems.push(`${mod.id}.${key}: invalid value`);
      else m[key] = value as ModuleAnswers[string];
    }
    answers[mod.id] = effectiveModule(mod, m);
  }
  if (problems.length) return { ok: false, error: "invalid_answers", problems };
  const incomplete = MODULES.filter((mod) => !moduleComplete(mod, answers[mod.id])).map((mod) => `${mod.id}: required answers missing`);
  if (incomplete.length) return { ok: false, error: "dips_incomplete", problems: incomplete };
  return { ok: true, answers };
}
