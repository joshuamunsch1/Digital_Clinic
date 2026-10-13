import type { LangNode } from "../i18n";
import type { ModuleAnswers } from "../types";

export type Pred = (m: ModuleAnswers) => boolean;

export interface GridCol {
  key: string;
  kind: "sev03" | "yesno";
  label: LangNode;
  /// Starred follow-up column in the DIPS (e.g. *Vermeidung, *Mehrzahl der
  /// Tage): must be answered for every endorsed row of a required grid.
  req?: boolean;
}
export interface GridRow {
  key: string;
  label: LangNode;
  /// "Andere/Sonstiges" rows and the two free animal slots: the row carries a
  /// free-text specifier (`<grid>_<row>_spec`) and may stay unanswered — an
  /// untouched specifier row is not counted as a missing answer.
  specify?: boolean;
}
export interface GridGroup {
  title?: LangNode;
  rows: GridRow[];
}
export interface DualPart {
  key: string;
  label: LangNode;
}
export interface CheckOption {
  key: string;
  label: LangNode;
}

export type ItemType =
  | "subhead"
  | "yesno"
  | "yesno_text"
  | "textarea"
  | "text"
  | "date"
  | "monthyear_range"
  | "number_label"
  | "dual_scale"
  | "grid";

export interface Item {
  id: string;
  type: ItemType;
  /// Item number as printed in the DIPS Open Access 1.2 Interviewleitfaden /
  /// Protokollbogen. Ids are storage keys and stay stable; codes are display.
  code?: string;
  q?: LangNode;
  /// Starred (*) in the DIPS: indispensable for the diagnosis.
  req?: boolean;
  showIf?: Pred;
  checks?: CheckOption[]; // yesno with extra checkboxes
  describe?: LangNode; // yesno_text follow-up label
  unit?: LangNode; // number_label
  max?: number; // number_label upper bound
  help?: LangNode; // dual_scale / grid
  parts?: DualPart[]; // dual_scale
  primaryLabel?: LangNode; // grid primary column header
  note?: LangNode; // grid
  groups?: GridGroup[]; // grid
  cols?: GridCol[]; // grid conditional follow-up columns
}

export interface Section {
  id: string;
  title?: LangNode;
  intro?: LangNode;
  items: Item[];
}

export interface DipsModule {
  id: string;
  code: string;
  color: string;
  title: LangNode;
  enter: Pred;
  sections: Section[];
}

/// Keys of the shared closing block ("tail") every module ends with. The DIPS
/// numbers these items differently per disorder — `TailOptions.codes` carries
/// the module's own numbering, and an item is only emitted when it has one.
export type TailKey =
  | "cog"
  | "cope"
  | "first"
  | "subst1"
  | "subst2"
  | "organic"
  | "onset_age"
  | "since"
  | "dur6"
  | "hist1"
  | "hist2"
  | "approp"
  | "impact"
  | "earlier";

export interface TailOptions {
  enter: Pred;
  /// Official item number per tail item; items without a code are omitted.
  codes: Partial<Record<TailKey, string>>;
  /// Tail items starred in this module's section of the DIPS.
  starred: TailKey[];
  organic: LangNode; // "z. B." examples of the organic rule-out, per module
  cognition?: LangNode;
  coping?: LangNode;
  first?: LangNode; // "Geschichte": first occurrence
  /// Module-specific items sorted into the tail by their own code.
  extra?: Item[];
}
