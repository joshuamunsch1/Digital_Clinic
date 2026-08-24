import type { LangNode } from "../i18n";
import type { ModuleAnswers } from "../types";

export type Pred = (m: ModuleAnswers) => boolean;

export interface GridCol {
  key: string;
  kind: "sev03" | "yesno";
  label: LangNode;
}
export interface GridRow {
  key: string;
  label: LangNode;
}
export interface GridGroup {
  title?: LangNode;
  rows: GridRow[];
  /// Rows kept for interview completeness that do NOT count toward a
  /// category-count criterion (e.g. "alone at home" is not one of the five
  /// DSM-5 agoraphobia situation categories).
  nonCore?: boolean;
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
  | "date"
  | "monthyear_range"
  | "number_label"
  | "dual_scale"
  | "grid";

export interface Item {
  id: string;
  type: ItemType;
  code?: string;
  q?: LangNode;
  req?: boolean;
  showIf?: Pred;
  checks?: CheckOption[]; // yesno with extra checkboxes
  describe?: LangNode; // yesno_text follow-up label
  unit?: LangNode; // number_label
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

export interface OrganicExamples {
  de: string;
  fr: string;
  en: string;
}

export interface TailOptions {
  enter: Pred;
  organic: OrganicExamples;
  cognition?: LangNode;
  coping?: LangNode;
  appropriateness?: boolean;
  duration6?: boolean;
}
