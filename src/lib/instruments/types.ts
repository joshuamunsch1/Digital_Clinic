// The generic instrument model: a questionnaire definition as data.
// These types are shared by the catalog loader (seeding), the scoring engine,
// the API serializers and the client UI.

export type DefinitionStatus = "complete" | "partial" | "not_extracted";
export type InstrumentType = "likert_battery" | "structured_interview";
export type CadenceType = "every_session" | "wave" | "periodic" | "intake_once";

export interface ItemDef {
  id: string;
  /// Short label safe to show clinicians (item code or construct name).
  /// Full item wording of licensed instruments is deliberately NOT stored
  /// (see docs/legacy-system-reference.md) — `text` is only set for
  /// clinic-internal instruments.
  label: string;
  text?: string;
  responseType: "likert" | "categorical" | "number" | "text";
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  options?: string[];
  valueMap?: Record<string, number>;
  reverseScored?: boolean;
  /// true when min/max are an assumed default, not verified against the
  /// instrument's manual — surfaced in the UI rather than silently trusted.
  rangeAssumed?: boolean;
}

export type FormulaDef =
  | { type: "sum"; items: string[]; missingTolerance?: number; note?: string }
  | { type: "mean"; items: string[]; missingTolerance?: number; note?: string }
  | { type: "prorated_sum"; items: string[]; totalItems?: number; note?: string }
  | { type: "custom"; expression?: string; note?: string };

export interface NormBand {
  min: number;
  max: number;
  label: string;
}

export interface ScaleDef {
  key: string;
  label: string;
  formula: FormulaDef;
  normBands?: NormBand[];
  /// Theoretical score range, when known — fixes the y-axis of trajectory charts.
  range?: { min: number; max: number };
  /// Direction of clinical improvement (true = higher scores are better).
  /// Drives trend-arrow coloring and the patient summary strip.
  higherIsBetter?: boolean;
  /// Clinical safety alert: when the LATEST value of this scale is >= gte,
  /// the UI shows a warning banner (e.g. BDI-FS suicide item).
  alert?: { gte: number; message: string };
  /// Reliable Change Index parameters (Jacobson & Truax): SEdiff = sd·√2·√(1−r).
  /// Values marked "placeholder" in note MUST be verified against the manual.
  rci?: { reliability: number; sd: number; note?: string };
  sortOrder: number;
}

export interface InstrumentDef {
  id: string;
  name: string;
  abbreviation: string;
  population: string;
  raterRole: string;
  instrumentType: InstrumentType;
  cadenceType: CadenceType;
  cadenceConfig: { waves?: string[]; note?: string };
  definitionStatus: DefinitionStatus;
  items: ItemDef[];
  scales: ScaleDef[];
  sourceNotes: string;
  limesurveySurveyId?: string | null;
  limesurveyMapping?: Record<string, string>;
}

export type RawAnswers = Record<string, number | string | null | undefined>;

/// An instrument is scoreable when its definition is verified-complete and every
/// scale formula is concrete. Partial/not_extracted catalog entries are kept
/// visible but never scored.
export function isScoreable(def: Pick<InstrumentDef, "definitionStatus" | "items" | "scales">): boolean {
  if (def.definitionStatus !== "complete") return false;
  if (!def.items.length || !def.scales.length) return false;
  return def.scales.every((s) => {
    const f = s.formula;
    if (f.type === "custom") return typeof f.expression === "string" && f.expression.length > 0;
    return Array.isArray(f.items) && f.items.length > 0;
  });
}

/// Can a form be rendered for a respondent to fill out?
export function isFillable(def: Pick<InstrumentDef, "definitionStatus" | "instrumentType" | "items">): boolean {
  if (def.instrumentType === "structured_interview") return def.definitionStatus === "complete";
  return def.definitionStatus === "complete" && def.items.length > 0;
}

/// Full item wording available — required to present the form to a patient.
/// Licensed instruments deliberately carry only item codes (no text), so they
/// can be scored from imports but never rendered in-app.
export function hasFullWording(def: Pick<InstrumentDef, "items">): boolean {
  return def.items.length > 0 && def.items.every((it) => !!it.text);
}
