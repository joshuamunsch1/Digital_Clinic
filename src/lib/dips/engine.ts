import type { DipsAnswers, ModuleAnswers } from "../types";
import { MODULES } from "./schema";
import type { DipsModule, Item } from "./types";

export const gridRows = (item: Item) => (item.groups ?? []).flatMap((g) => g.rows);

export const isVisible = (item: Item, m: ModuleAnswers) => (item.showIf ? item.showIf(m) : true);

export function itemAnswered(item: Item, m: ModuleAnswers): boolean {
  if (item.type === "yesno" || item.type === "yesno_text") {
    return m[item.id] === "yes" || m[item.id] === "no";
  }
  if (item.type === "grid") {
    return gridRows(item).every((r) => {
      const v = m[`${item.id}_${r.key}_primary`];
      return v === "yes" || v === "no";
    });
  }
  return true;
}

export function moduleComplete(mod: DipsModule, m: ModuleAnswers): boolean {
  return mod.sections
    .flatMap((s) => s.items)
    .filter((it) => isVisible(it, m) && it.req)
    .every((it) => itemAnswered(it, m));
}

export function screeningAnswered(mod: DipsModule, m: ModuleAnswers): boolean {
  return mod.sections[0].items
    .filter((it) => isVisible(it, m) && it.req)
    .every((it) => itemAnswered(it, m));
}

export function allComplete(answers: DipsAnswers): boolean {
  return MODULES.every((mod) => moduleComplete(mod, answers[mod.id] || {}));
}

export function anyEntered(answers: DipsAnswers): boolean {
  return MODULES.some((mod) => mod.enter(answers[mod.id] || {}));
}

export function enteredModules(answers: DipsAnswers): DipsModule[] {
  return MODULES.filter((mod) => mod.enter(answers[mod.id] || {}));
}
