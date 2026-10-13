import type { DipsAnswers, ModuleAnswers } from "../types";
import { inkKey } from "../ink";
import { MODULES } from "./schema";
import type { DipsModule, GridRow, Item } from "./types";

export const gridRows = (item: Item) => (item.groups ?? []).flatMap((g) => g.rows);

export const isVisible = (item: Item, m: ModuleAnswers) => (item.showIf ? item.showIf(m) : true);

const rowFollowUpKeys = (item: Item, row: GridRow) => (item.cols ?? []).map((c) => `${item.id}_${row.key}_${c.key}`);

/// Every answer key an item can write (see DipsRenderer for the conventions).
export function itemKeys(item: Item): string[] {
  switch (item.type) {
    case "subhead":
      return [];
    case "yesno":
      return [item.id, ...(item.checks ?? []).map((c) => `${item.id}_${c.key}`)];
    case "yesno_text":
      return [item.id, `${item.id}_text`, inkKey(`${item.id}_text`)];
    case "textarea":
      return [item.id, inkKey(item.id)];
    case "monthyear_range":
      return [`${item.id}_from`, `${item.id}_to`];
    case "dual_scale":
      return (item.parts ?? []).map((p) => `${item.id}_${p.key}`);
    case "grid":
      return gridRows(item).flatMap((r) => [
        `${item.id}_${r.key}_primary`,
        ...rowFollowUpKeys(item, r),
        ...(r.specify ? [`${item.id}_${r.key}_spec`] : []),
      ]);
    default:
      return [item.id]; // text, date, number_label
  }
}

/// The answers the interview actually stands on: everything recorded under an
/// item that the skip logic currently hides is dropped, as are the follow-up
/// ratings of a checklist row answered "Nein". The form keeps such leftovers
/// in its state (so correcting a mis-click restores what was entered), which
/// is exactly why nothing may read them — a stale "Ja" behind a corrected
/// screening question would otherwise keep a module entered or satisfy a
/// criterion. Hiding an item can hide further items, hence the fixpoint.
/// Returns `m` itself when nothing is stale.
export function effectiveModule(mod: DipsModule, m: ModuleAnswers): ModuleAnswers {
  const items = mod.sections.flatMap((s) => s.items);
  let cur = m;
  for (let pass = 0; pass < 12; pass++) {
    const stale: string[] = [];
    for (const it of items) {
      if (!isVisible(it, cur)) stale.push(...itemKeys(it));
      else if (it.type === "grid")
        for (const r of gridRows(it))
          if (cur[`${it.id}_${r.key}_primary`] !== "yes") stale.push(...rowFollowUpKeys(it, r));
    }
    const present = stale.filter((k) => cur[k] !== undefined);
    if (!present.length) return cur;
    cur = { ...cur };
    for (const k of present) delete cur[k];
  }
  return cur;
}

export function effectiveAnswers(answers: DipsAnswers): DipsAnswers {
  const out: DipsAnswers = { ...answers };
  for (const mod of MODULES) out[mod.id] = effectiveModule(mod, answers[mod.id] ?? {});
  return out;
}

const yesNo = (v: unknown) => v === "yes" || v === "no";
const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

/// A number field holds a usable value (non-negative, within the item's bound).
export const numberValid = (item: Item, v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && (item.max === undefined || n <= item.max);
};

export function itemAnswered(item: Item, m: ModuleAnswers): boolean {
  switch (item.type) {
    case "subhead":
      return true;
    case "yesno":
    case "yesno_text":
      return yesNo(m[item.id]);
    case "grid":
      return gridRows(item).every((r) => {
        const v = m[`${item.id}_${r.key}_primary`];
        if (v === undefined && r.specify) return true;
        if (v === "no") return true;
        return v === "yes" && (item.cols ?? []).every((c) => !c.req || filled(m[`${item.id}_${r.key}_${c.key}`]));
      });
    case "dual_scale":
      return (item.parts ?? []).every((p) => typeof m[`${item.id}_${p.key}`] === "number");
    case "number_label":
      return filled(m[item.id]) && numberValid(item, m[item.id]);
    case "monthyear_range":
      return filled(m[`${item.id}_from`]) || filled(m[`${item.id}_to`]);
    default:
      return filled(m[item.id]);
  }
}

const itemOk = (it: Item, m: ModuleAnswers) =>
  (it.req ? itemAnswered(it, m) : true) &&
  // An optional number may stay empty, but not hold an out-of-range value.
  (it.type !== "number_label" || !filled(m[it.id]) || numberValid(it, m[it.id]));

export function moduleComplete(mod: DipsModule, m: ModuleAnswers): boolean {
  const e = effectiveModule(mod, m);
  return mod.sections
    .flatMap((s) => s.items)
    .filter((it) => isVisible(it, e))
    .every((it) => itemOk(it, e));
}

export function screeningAnswered(mod: DipsModule, m: ModuleAnswers): boolean {
  const e = effectiveModule(mod, m);
  return mod.sections[0].items
    .filter((it) => isVisible(it, e) && it.req)
    .every((it) => itemAnswered(it, e));
}

export function allComplete(answers: DipsAnswers): boolean {
  return MODULES.every((mod) => moduleComplete(mod, answers[mod.id] || {}));
}

export function enteredModules(answers: DipsAnswers): DipsModule[] {
  return MODULES.filter((mod) => mod.enter(effectiveModule(mod, answers[mod.id] || {})));
}

export function anyEntered(answers: DipsAnswers): boolean {
  return enteredModules(answers).length > 0;
}
