// Server-side catalog loader: normalizes docs/instrument-catalog.json into
// typed InstrumentDefs for seeding, plus the clinic-internal DIPS intake that is
// defined in code.
//
// The catalog file is honest about what was verified (itemSchemaStatus:
// complete/partial/not_extracted) and has documented irregularities that are
// normalized HERE, explicitly per instrument, rather than guessed at generically:
// - PSTB gets its 22 German item texts from the clinic-provided BSTB-PT.pdf
//   (2026-07-02) with the verified −3..+3 response scale
// - DIKJ lists one item + a prose note -> expand to DIKJ1..DIKJ29
// - FGG lists one item + a prose note -> expand to GG1..GG37; GG_Mean's item
//   list contains a "...GG37" placeholder -> expanded
// - the SDQ parent variants say "identical structure to sdq_self_11_17" -> cloned
// - partial/not_extracted entries keep their scale labels but are not scoreable
//
// Response ranges: PSTB is verified (−3..+3, from the PDF); BDI-FS 0-3, SDQ 0-2,
// DIKJ 0-2 and EDE-Q 0-6 are the published standards; SBKJ and FGG are NOT
// verified — their items carry rangeAssumed: true and the UI shows the assumption.
//
// RCI parameters (reliability/sd) on BDI-FS and SDQ are PLACEHOLDERS to
// demonstrate the reliable-change mechanism — each carries a note saying so and
// must be replaced with values from the manuals before clinical interpretation.

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
  pstb_adult: { min: -3, max: 3 }, // verified from BSTB-PT.pdf
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

function normalizeFormula(raw: RawScale["formula"], itemsFixup?: string[]): FormulaDef {
  const items = itemsFixup ?? (Array.isArray(raw.items) ? (raw.items as string[]) : undefined);
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

interface ScaleOpts {
  /// replacement item lists per scale key (e.g. FGG's "...GG37" placeholder)
  items?: Record<string, string[]>;
  /// per-scale extra fields merged in (range, higherIsBetter, alert, rci, …)
  overrides?: Record<string, Partial<ScaleDef>>;
  /// extra fields applied to every scale (per-scale overrides win)
  defaults?: Partial<ScaleDef>;
}

function normalizeScales(raw: RawScale[], opts: ScaleOpts = {}): ScaleDef[] {
  return raw.map((s, i) => ({
    key: s.key,
    label: s.label,
    formula: normalizeFormula(s.formula, opts.items?.[s.key]),
    normBands: s.normBands,
    sortOrder: i,
    ...opts.defaults,
    ...opts.overrides?.[s.key],
  }));
}

// --- PSTB item wording (clinic-provided BSTB-PT.pdf, Patientenstundenbogen) -----
// Validated German instrument wording — shown in German in every UI language.
// Reverse-scored items are I8/I12/I14/I19 per the legacy SPSS syntax; the PDF's
// "items 10/11 reversed" note applies to the Therapeutenstundenbogen that
// follows in the same file (its items 10/11 are the negatively-worded ones).
const PSTB_TEXT: Record<string, string> = {
  I1: "Heute habe ich mich in der Beziehung zum Therapeuten wohlgefühlt.",
  I2: "Ich habe das Gefühl, dass ich mich selbst und meine Probleme besser verstehe.",
  I3: "Heute sind wir dem Kern meiner Probleme näher gekommen.",
  I4: "Heute sind wir in der Therapie wirklich vorwärtsgekommen.",
  I5: "Der Therapeut lässt mich spüren, wo meine Stärken liegen.",
  I6: "Heute ist mir klarer geworden, weshalb ich gegenüber bestimmten Menschen gerade so und nicht anders reagiere.",
  I7: "Der Therapeut und ich verstehen einander.",
  I8: "Ich finde, der Therapeut müsste meinen Gefühlen mehr Beachtung schenken.",
  I9: "Ich glaube, der Therapeut ist wirklich an meinem Wohlergehen interessiert.",
  I10: "Im Moment fühle ich mich durch den Therapeuten darin unterstützt, wie ich gerne sein möchte.",
  I11: "Ich traue mir jetzt mehr zu, meine Probleme aus eigener Kraft zu lösen.",
  I12: "Ich finde die Sichtweise des Therapeuten von meinen Problemen zu einfach.",
  I13: "Ich weiss jetzt besser, was ich will.",
  I14: "Heute hatte ich das Gefühl, der Therapeut denkt etwas anderes über mich, als er mir sagt.",
  I15: "Heute war ich gefühlsmässig stark beteiligt.",
  I16: "Ich spüre, dass der Therapeut mich wertschätzt.",
  I17: "Was wir heute gemacht haben, ging mir sehr nahe.",
  I18: "Ich fühle mich jetzt Situationen besser gewachsen, denen ich mich bisher nicht gewachsen gefühlt habe.",
  I19: "Ich glaube, ein anderes therapeutisches Vorgehen wäre für mich besser geeignet.",
  I20: "Ich habe den Verlauf der Sitzung aktiv mitgestalten können.",
  I21: "Ich kann selber entscheiden, was in der Therapie besprochen wird.",
  I22: "Der Therapeut lässt mich in der Therapie meinen eigenen Weg gehen.",
};

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
    case "pstb_adult": {
      const r = RANGES.pstb_adult;
      const items: ItemDef[] = (raw.items as { id: string; reverseScored?: boolean }[]).map((it) => ({
        id: it.id,
        label: prettyLabel(it.id),
        text: PSTB_TEXT[it.id],
        responseType: "likert" as const,
        min: r.min,
        max: r.max,
        minLabel: "überhaupt nicht",
        maxLabel: "ja, ganz genau",
        reverseScored: it.reverseScored || undefined,
      }));
      const scales = normalizeScales(raw.scales as RawScale[], {
        defaults: { range: { min: r.min, max: r.max }, higherIsBetter: true },
      });
      // Therapiefortschritte is the clinic's headline session metric — put it
      // first so the summary strip / scores matrix (which use the first scale)
      // agree with the dashboard.
      const ordered = [
        ...scales.filter((s) => s.key === "Therapiefortschritte"),
        ...scales.filter((s) => s.key !== "Therapiefortschritte"),
      ].map((s, i) => ({ ...s, sortOrder: i }));
      return {
        ...base,
        items,
        scales: ordered,
        sourceNotes:
          base.sourceNotes +
          " Item wording added 2026-07-02 from clinic-provided BSTB-PT.pdf (Patientenstundenbogen); response scale verified -3..+3. The PDF's 'items 10/11 reversed' note refers to the Therapeutenstundenbogen; patient-form reverse items remain I8/I12/I14/I19 per legacy syntax — confirm with clinic.",
      };
    }
    case "dikj": {
      // Catalog stores one sample item + a prose note; the real battery is DIKJ1..29.
      const items = likertItems(expandIds("DIKJ", 1, 29), range);
      const scales = normalizeScales(raw.scales as RawScale[], {
        overrides: { Gesamtrohwert: { range: { min: 0, max: 58 }, higherIsBetter: false } },
      });
      return { ...base, items, scales };
    }
    case "fgg": {
      // Catalog stores one sample item + a prose note; the battery is GG1..GG37,
      // and GG_Mean's item list contains a literal "...GG37" placeholder.
      const r = RANGES.fgg;
      const items = likertItems(expandIds("GG", 1, 37), r);
      const allIds = items.map((i) => i.id);
      const scales = normalizeScales(raw.scales as RawScale[], {
        items: { GG_Mean: allIds },
        defaults: { higherIsBetter: false },
        overrides: { GG_Mean: { range: { min: r.min, max: r.max } } },
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
      const scales = normalizeScales(raw.scales as RawScale[], {
        overrides: { Gesamtscore: { range: { min: 0, max: 10 }, higherIsBetter: false } },
      });
      return { ...base, items, scales };
    }
    case "bdi_fs": {
      const items = likertItems(raw.items as { id: string; reverseScored?: boolean; scaleMax?: number }[], range);
      const scales = normalizeScales(raw.scales as RawScale[], {
        defaults: { higherIsBetter: false },
        overrides: {
          BDI_FS_total: {
            range: { min: 0, max: 21 },
            rci: {
              reliability: 0.85,
              sd: 4.5,
              note: "PLACEHOLDER psychometrics to demonstrate the RCI mechanism — replace with reliability/SD from the German BDI-FS manual before clinical interpretation.",
            },
          },
          BDI_FS_Suiziditem: {
            range: { min: 0, max: 3 },
            alert: {
              gte: 1,
              message: "BDI-FS suicide item endorsed (item 7 ≥ 1) — review with the patient promptly.",
            },
          },
        },
      });
      return { ...base, items, scales };
    }
    case "edeq8": {
      const items = likertItems(raw.items as { id: string; reverseScored?: boolean }[], range);
      const scales = normalizeScales(raw.scales as RawScale[], {
        defaults: { range: { min: 0, max: 6 }, higherIsBetter: false },
      });
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
      const scaleRanges: Record<string, Partial<ScaleDef>> = {};
      if (raw.id === "sbkj_child" && range) {
        for (const s of raw.scales as RawScale[])
          scaleRanges[s.key] = { range: { min: range.min, max: range.max }, higherIsBetter: true };
      }
      const scales = Array.isArray(raw.scales)
        ? normalizeScales(raw.scales as RawScale[], { overrides: scaleRanges })
        : [];
      return { ...base, items, scales };
    }
  }
}

function sdqScales(raw: RawScale[]): ScaleDef[] {
  const sub = { range: { min: 0, max: 10 }, higherIsBetter: false };
  return normalizeScales(raw, {
    overrides: {
      EmoProbl: sub,
      VerhProbl: sub,
      Hyperak: sub,
      VerhProblGleich: sub,
      Prosoz: { range: { min: 0, max: 10 }, higherIsBetter: true },
      GesProbl: {
        range: { min: 0, max: 40 },
        higherIsBetter: false,
        rci: {
          reliability: 0.8,
          sd: 5.8,
          note: "PLACEHOLDER psychometrics to demonstrate the RCI mechanism — replace with reliability/SD from the SDQ norms before clinical interpretation.",
        },
      },
    },
  });
}

// --- clinic-internal instrument -------------------------------------------------

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

/// All instrument definitions to seed: normalized catalog + the DIPS intake.
/// (The former clinic-internal wellbeing_checkin was replaced by the real PSTB
/// on 2026-07-02 per clinic decision.)
export function loadInstrumentDefs(): InstrumentDef[] {
  const catalog = readCatalog();
  const normalized = catalog
    .map((raw) => normalizeEntry(raw, catalog))
    .filter((d): d is InstrumentDef => d !== null);
  return [DIPS_INTAKE, ...normalized];
}
