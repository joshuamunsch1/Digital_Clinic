// Server-side catalog loader: normalizes docs/instrument-catalog.json into
// typed InstrumentDefs for seeding, plus the two clinic-internal instruments
// (the wellbeing check-in and the DIPS anxiety intake) that are defined in code
// because their full wording is ours to store.
//
// The catalog file is honest about what was verified (itemSchemaStatus:
// complete/partial/not_extracted) and has documented irregularities that are
// normalized HERE, explicitly per instrument, rather than guessed at generically:
// - DIKJ lists one item + a prose note -> expand to DIKJ1..DIKJ29
// - FGG lists one item + a prose note -> expand to GG1..GG37; GG_Mean's item
//   list contains a "...GG37" placeholder -> expanded
// - the SDQ parent variants say "identical structure to sdq_self_11_17" -> cloned
// - partial/not_extracted entries keep their scale labels but are not scoreable
//
// Response ranges: the legacy export did not record item response ranges for
// every instrument. Where the published instrument's range is standard knowledge
// (BDI-FS 0-3, SDQ 0-2, DIKJ 0-2, EDE-Q 0-6) it is set directly; where it is NOT
// verified (PSTB, SBKJ, FGG) items carry rangeAssumed: true and the UI shows the
// assumption instead of silently trusting it.

import fs from "node:fs";
import path from "node:path";
import type {
  DefinitionStatus,
  FormulaDef,
  InstrumentDef,
  ItemDef,
  NormBand,
  ScaleDef,
} from "./types";

// --- raw catalog shapes (loose on purpose; the file mixes strings and objects) --

interface RawScale {
  key: string;
  label: string;
  formula: { type: string; items?: unknown; expression?: string; missingTolerance?: number; totalItems?: number; note?: string };
  normBands?: NormBand[];
}
interface RawInstrument {
  id: string;
  name: string;
  abbreviation: string;
  population: string;
  raterRole: string;
  instrumentType: string;
  cadenceType: string;
  cadenceConfig: Record<string, unknown>;
  itemSchemaStatus: DefinitionStatus;
  items: unknown;
  scales: unknown;
  sourceNotes: string;
}

function readCatalog(): RawInstrument[] {
  const file = path.join(process.cwd(), "docs", "instrument-catalog.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { instruments: RawInstrument[] };
  return parsed.instruments;
}

// --- helpers -------------------------------------------------------------------

interface Range { min: number; max: number; assumed?: boolean }

/// Item response ranges per instrument (see file header for verification status).
const RANGES: Record<string, Range> = {
  pstb_adult: { min: 0, max: 6, assumed: true },
  sbkj_child: { min: 0, max: 6, assumed: true },
  bdi_fs: { min: 0, max: 3 },
  dikj: { min: 0, max: 2 },
  sdq_self_11_17: { min: 0, max: 2 },
  sdq_parent_4_17: { min: 0, max: 2 },
  sdq_parent_2_4: { min: 0, max: 2 },
  fgg: { min: 1, max: 6, assumed: true },
  edeq8: { min: 0, max: 6 },
};

const prettyLabel = (id: string) => id.replace(/_/g, " ");

function likertItems(ids: { id: string; reverseScored?: boolean; scaleMax?: number }[], range: Range | undefined): ItemDef[] {
  return ids.map((raw) => ({
    id: raw.id,
    label: prettyLabel(raw.id),
    responseType: "likert" as const,
    min: range?.min ?? 0,
    max: raw.scaleMax ?? range?.max,
    reverseScored: raw.reverseScored || undefined,
    rangeAssumed: range?.assumed || undefined,
  }));
}

function expandIds(prefix: string, from: number, to: number): { id: string }[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ id: `${prefix}${from + i}` }));
}

function normalizeFormula(raw: RawScale["formula"], fixups?: { items?: string[] }): FormulaDef {
  const items = fixups?.items ?? (Array.isArray(raw.items) ? (raw.items as string[]) : undefined);
  switch (raw.type) {
    case "sum":
      if (!items) return { type: "custom", note: raw.note ?? "item list not transcribed" };
      return { type: "sum", items, missingTolerance: raw.missingTolerance, note: raw.note };
    case "mean":
      if (!items) return { type: "custom", note: raw.note ?? "item list not transcribed" };
      return { type: "mean", items, missingTolerance: raw.missingTolerance, note: raw.note };
    case "prorated_sum":
      if (!items) return { type: "custom", note: raw.note ?? "item list not transcribed" };
      return { type: "prorated_sum", items, totalItems: raw.totalItems, note: raw.note };
    default:
      return { type: "custom", expression: raw.expression, note: raw.note };
  }
}

function normalizeScales(raw: RawScale[], fixups: Record<string, { items?: string[]; range?: { min: number; max: number } }> = {}, ranges: Record<string, { min: number; max: number }> = {}): ScaleDef[] {
  return raw.map((s, i) => ({
    key: s.key,
    label: s.label,
    formula: normalizeFormula(s.formula, fixups[s.key]),
    normBands: s.normBands,
    range: fixups[s.key]?.range ?? ranges[s.key],
    sortOrder: i,
  }));
}

// --- per-instrument normalization ------------------------------------------------

function normalizeEntry(raw: RawInstrument, all: RawInstrument[]): InstrumentDef | null {
  if (raw.instrumentType === "composite") return null; // batteries are bundles, not instruments (see doc)

  const base = {
    id: raw.id,
    name: raw.name,
    abbreviation: raw.abbreviation,
    population: raw.population,
    raterRole: raw.raterRole,
    instrumentType: raw.instrumentType === "structured_interview" ? ("structured_interview" as const) : ("likert_battery" as const),
    cadenceType: raw.cadenceType as InstrumentDef["cadenceType"],
    cadenceConfig: (raw.cadenceConfig ?? {}) as InstrumentDef["cadenceConfig"],
    definitionStatus: raw.itemSchemaStatus,
    sourceNotes: raw.sourceNotes ?? "",
  };
  const range = RANGES[raw.id];

  switch (raw.id) {
    case "dikj": {
      // Catalog stores one sample item + a prose note; the real battery is DIKJ1..29.
      const items = likertItems(expandIds("DIKJ", 1, 29), range);
      const scales = normalizeScales(raw.scales as RawScale[], { Gesamtrohwert: { range: { min: 0, max: 58 } } });
      return { ...base, items, scales };
    }
    case "fgg": {
      // Catalog stores one sample item + a prose note; the battery is GG1..GG37,
      // and GG_Mean's item list contains a literal "...GG37" placeholder.
      const r = RANGES.fgg;
      const items = likertItems(expandIds("GG", 1, 37), r);
      const allIds = items.map((i) => i.id);
      const scales = normalizeScales(raw.scales as RawScale[], {
        GG_Mean: { items: allIds, range: { min: r.min, max: r.max } },
      });
      return { ...base, items, scales };
    }
    case "sdq_parent_4_17":
    case "sdq_parent_2_4": {
      // "identical structure to sdq_self_11_17" — clone items and scales.
      const self = all.find((e) => e.id === "sdq_self_11_17");
      if (!self) throw new Error("catalog is missing sdq_self_11_17 to clone from");
      const items = likertItems(self.items as { id: string; reverseScored?: boolean }[], range);
      const scales = sdqScales(self.scales as RawScale[]);
      return { ...base, items, scales };
    }
    case "sdq_self_11_17": {
      const items = likertItems(raw.items as { id: string; reverseScored?: boolean }[], range);
      return { ...base, items, scales: sdqScales(raw.scales as RawScale[]) };
    }
    case "psc_short_self": {
      const items = (raw.items as { id: string; options: string[]; valueMap: Record<string, number> }[]).map((it) => ({
        id: it.id,
        label: prettyLabel(it.id),
        responseType: "categorical" as const,
        options: it.options,
        valueMap: it.valueMap,
      }));
      const scales = normalizeScales(raw.scales as RawScale[], { Gesamtscore: { range: { min: 0, max: 10 } } });
      return { ...base, items, scales };
    }
    default: {
      // Structured items array -> normalize; anything else (prose strings for
      // partial/not_extracted entries) -> no renderable items.
      const items = Array.isArray(raw.items)
        ? likertItems(
            (raw.items as unknown[]).filter(
              (it): it is { id: string; reverseScored?: boolean; scaleMax?: number } =>
                typeof it === "object" && it !== null && "id" in it && !String((it as { id: string }).id).includes(".."),
            ),
            range,
          )
        : [];
      const scaleRanges: Record<string, { min: number; max: number }> = {};
      if (raw.id === "bdi_fs") {
        scaleRanges["BDI_FS_total"] = { min: 0, max: 21 };
        scaleRanges["BDI_FS_Suiziditem"] = { min: 0, max: 3 };
      }
      if ((raw.id === "pstb_adult" || raw.id === "sbkj_child") && range) {
        for (const s of raw.scales as RawScale[]) scaleRanges[s.key] = { min: range.min, max: range.max };
      }
      if (raw.id === "edeq8") {
        for (const s of raw.scales as RawScale[]) scaleRanges[s.key] = { min: 0, max: 6 };
      }
      const scales = Array.isArray(raw.scales) ? normalizeScales(raw.scales as RawScale[], {}, scaleRanges) : [];
      return { ...base, items, scales };
    }
  }
}

function sdqScales(raw: RawScale[]): ScaleDef[] {
  return normalizeScales(raw, {
    EmoProbl: { range: { min: 0, max: 10 } },
    VerhProbl: { range: { min: 0, max: 10 } },
    Hyperak: { range: { min: 0, max: 10 } },
    VerhProblGleich: { range: { min: 0, max: 10 } },
    Prosoz: { range: { min: 0, max: 10 } },
    GesProbl: { range: { min: 0, max: 40 } },
  });
}

// --- clinic-internal instruments (full wording is ours; safe to store) -----------

const WELLBEING_ITEMS: { id: string; label: string; text: string }[] = [
  { id: "mood", label: "Mood", text: "How would you rate your overall mood?" },
  { id: "calm", label: "Calmness", text: "How calm and relaxed have you felt?" },
  { id: "sleep", label: "Sleep", text: "How well have you been sleeping?" },
  { id: "energy", label: "Energy", text: "How much energy have you had in daily life?" },
  { id: "social", label: "Connection", text: "How connected have you felt to the people around you?" },
  { id: "coping", label: "Coping", text: "How confident have you felt in handling your difficulties?" },
];

export const WELLBEING_CHECKIN: InstrumentDef = {
  id: "wellbeing_checkin",
  name: "Post-session wellbeing check-in",
  abbreviation: "Check-in",
  population: "all",
  raterRole: "self",
  instrumentType: "likert_battery",
  cadenceType: "every_session",
  cadenceConfig: {},
  definitionStatus: "complete",
  items: WELLBEING_ITEMS.map((d) => ({
    id: d.id,
    label: d.label,
    text: d.text,
    responseType: "likert" as const,
    min: 0,
    max: 10,
    minLabel: "not at all",
    maxLabel: "very much",
  })),
  scales: [
    {
      key: "wellbeing_index",
      label: "Wellbeing index",
      formula: { type: "custom", expression: "(mood + calm + sleep + energy + social + coping) / 6 * 10" },
      range: { min: 0, max: 100 },
      sortOrder: 0,
    },
    ...WELLBEING_ITEMS.map((d, i) => ({
      key: d.id,
      label: d.label,
      formula: { type: "mean" as const, items: [d.id] },
      range: { min: 0, max: 10 },
      sortOrder: i + 1,
    })),
  ],
  sourceNotes:
    "Clinic-internal 6-dimension check-in (the original Linden Clinic WellbeingEntry, now expressed as a generic instrument). Kept alongside PSTB/SBKJ until the clinic decides which session measure to use — PSTB is the real clinical equivalent but its licensed item wording is not stored here.",
};

export const DIPS_INTAKE: InstrumentDef = {
  id: "dips_anxiety_intake",
  name: "DIPS Open Access — anxiety intake (patient self-report adaptation)",
  abbreviation: "DIPS",
  population: "all",
  raterRole: "self",
  instrumentType: "structured_interview",
  cadenceType: "intake_once",
  cadenceConfig: {},
  definitionStatus: "complete",
  items: [], // rendered by the src/lib/dips engine; answers stored per module
  scales: [], // no repeated-measures scales — a one-time diagnostic screening
  sourceNotes:
    "Adapted from DIPS Open Access (Margraf et al., 2021). Rendered by the dedicated structured-interview engine (src/lib/dips), not the generic likert renderer; the completed interview is stored as a ResponseInstance with the FHIR QuestionnaireResponse in meta.",
};

/// All instrument definitions to seed: normalized catalog + clinic-internal ones.
export function loadInstrumentDefs(): InstrumentDef[] {
  const catalog = readCatalog();
  const normalized = catalog
    .map((raw) => normalizeEntry(raw, catalog))
    .filter((d): d is InstrumentDef => d !== null);
  return [WELLBEING_CHECKIN, DIPS_INTAKE, ...normalized];
}
