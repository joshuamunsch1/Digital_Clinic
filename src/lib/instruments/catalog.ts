// Server-side catalog loader: normalizes docs/instrument-catalog.json into
// typed InstrumentDefs for seeding, plus the clinic-internal DIPS intake that is
// defined in code.
//
// The catalog file is honest about what was verified (itemSchemaStatus:
// complete/partial/not_extracted) and has documented irregularities that are
// normalized HERE, explicitly per instrument, rather than guessed at generically:
// - PSTB gets its 22 German item texts from the clinic-provided BSTB-PT.pdf
//   (2026-07-02) with the verified −3..+3 response scale
// - SBKJ gets its 7 German item texts from In-Albon et al. (2021) (2026-07-03)
//   with the verified 0..6 response scale — see the sbkj_child case below
// - DIKJ lists one item + a prose note -> expand to DIKJ1..DIKJ29
// - FGG lists one item + a prose note -> expand to GG1..GG37; GG_Mean's item
//   list contains a "...GG37" placeholder -> expanded
// - the SDQ parent variants say "identical structure to sdq_self_11_17" -> cloned
// - partial/not_extracted entries keep their scale labels but are not scoreable
//
// Response ranges: PSTB (−3..+3) and SBKJ (0..6) are verified from primary
// sources; BDI-FS 0-3, SDQ 0-2, DIKJ 0-2 and EDE-Q 0-6 are the published
// standards; FGG is NOT verified — its items carry rangeAssumed: true and the
// UI shows the assumption.
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
  sbkj_child: { min: 0, max: 6 }, // verified 2026-07-03 from In-Albon et al. (2021) — 7-point Likert 0..6

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

// --- SBKJ-P item wording (Table 1, In-Albon et al., 2021, Kindheit und ----------
// Entwicklung 30(1), 63-75) -------------------------------------------------------
// The original SBKJ-P had 11 items; psychometric validation eliminated 4 of them
// (items with poor item difficulty/discrimination — including the only two
// reverse-scored items in the original pool) and kept 7, which is what the
// clinic's own Kinderstundenbogen.sav / Syntax_SBKJ.sps already reflects (matching
// item ids I1_Beziehung..I7_Eltern_helfen_mit below use the FINAL 7-item
// numbering, not the original 11-item numbering from the paper's Methods
// section). None of the final 7 items are reverse-scored. Items are phrased
// from the perspective of a fictional patient ("Michel") that the child rates
// agreement against — same 7-point 0 ("überhaupt nicht") .. 6 ("ja, ganz genau")
// anchors as the adult PSTB.
const SBKJ_LABEL: Record<string, string> = {
  I1_Beziehung: "Beziehung mit dem Therapeuten",
  I2_Selbstvertrauen: "Mehr Selbstvertrauen",
  I3_Problemloesen: "Probleme selber lösen",
  I4: "Verstehen, warum etwas so ist",
  I5: "Vorwärts kommen in der Therapie",
  I6_Mitentscheiden: "Mitentscheiden",
  I7_Eltern_helfen_mit: "Eltern helfen mit",
};
const SBKJ_TEXT: Record<string, string> = {
  I1_Beziehung:
    "Michel hat sich heute in der Therapie wohl gefühlt. Er hat das Gefühl, dass er sich mit dem Therapeuten sehr gut versteht und ihm vertrauen kann. Hast du dich in der heutigen Therapie auch so gefühlt?",
  I2_Selbstvertrauen:
    "Der Therapeut zeigt Michel, was er gut macht und unterstützt ihn darin, wie er gern sein möchte. Michel spürt, dass ihn der Therapeut ernst nimmt. Hast du dich in der heutigen Therapie auch so gefühlt?",
  I3_Problemloesen:
    "Michel kann jetzt mit Situationen besser umgehen, in denen er bisher Mühe hatte. Er traut sich, die Probleme selbst zu lösen und weiß auch besser, was er will. Hast du dich in der heutigen Therapie auch so gefühlt?",
  I4: "Michel glaubt, dass er jetzt seine Probleme besser versteht. Er weiß nun, warum er diese Probleme hat und warum er sich in bestimmten Situationen so verhält. Hast du dich in der heutigen Therapie auch so gefühlt?",
  I5: "Michel und der Therapeut sind in der heutigen Therapie weit fortgeschritten. Hast du dich in der heutigen Therapie auch so gefühlt?",
  I6_Mitentscheiden:
    "Der Therapeut lässt Michel mitentscheiden, was sie in der Therapie machen und besprechen. Hast du in der heutigen Therapie auch über die Sitzung mitbestimmen können?",
  I7_Eltern_helfen_mit:
    "Michels Eltern machen ihr Bestes, um ihn bei der Therapie zu unterstützen und sind an seinen Fortschritten interessiert. Sind deine Eltern auch so?",
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
      // agree with the dashboard. Its rci enables sudden-shift / early-change
      // detection (docs/outcome-prediction.md Stage 1) — PLACEHOLDER
      // psychometrics like BDI/SDQ, flagged in the note.
      const ordered = [
        ...scales.filter((s) => s.key === "Therapiefortschritte"),
        ...scales.filter((s) => s.key !== "Therapiefortschritte"),
      ].map((s, i) => ({
        ...s,
        sortOrder: i,
        ...(s.key === "Therapiefortschritte"
          ? {
              rci: {
                reliability: 0.8,
                sd: 1.2,
                note:
                  "PLATZHALTER-Psychometrie (wie BDI/SDQ): keine publizierten Reliabilitäts-/SD-Werte für die PSTB-Skala vorliegend — vor klinischer Interpretation durch Manual-/Klinikwerte ersetzen. Rohdaten bleiben re-skorierbar.",
              },
            }
          : {}),
      }));
      return {
        ...base,
        items,
        scales: ordered,
        sourceNotes:
          base.sourceNotes +
          " Item wording added 2026-07-02 from clinic-provided BSTB-PT.pdf (Patientenstundenbogen); response scale verified -3..+3. The PDF's 'items 10/11 reversed' note refers to the Therapeutenstundenbogen; patient-form reverse items remain I8/I12/I14/I19 per legacy syntax — confirm with clinic.",
      };
    }
    case "sbkj_child": {
      const r = RANGES.sbkj_child;
      const items: ItemDef[] = (raw.items as { id: string; reverseScored?: boolean }[]).map((it) => ({
        id: it.id,
        label: SBKJ_LABEL[it.id] ?? prettyLabel(it.id),
        text: SBKJ_TEXT[it.id],
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
      return {
        ...base,
        items,
        scales,
        sourceNotes:
          base.sourceNotes +
          " Item wording added 2026-07-03 from In-Albon, Munsch, Vonderlin, Kalmar, Brodard, Flückiger, Gutzweiler, Kircher & Mander (2021), 'Therapieprozesse in der Kinder- und Jugendlichenpsychotherapie: Evaluation des Patientenstundenbogens für Kinder und Jugendliche', Kindheit und Entwicklung 30(1), 63-75 (Table 1). Response scale verified 0..6 (7-point, same anchors as PSTB). The original 11-item pool had 2 reverse-scored items (dissatisfaction-in-therapy, parental-pressure); both were dropped during validation, so none of the final 7 items are reverse-scored. Two-factor structure (Beziehung = items 1-2, Selbstwirksamkeit = items 3-6, item 7 standalone) matches the clinic's own Syntax_SBKJ.sps exactly. NOTE: the paper's own descriptive statistics (Table 2) report the two subscales and the total as raw SUMS (e.g. Beziehung range 5-12, Selbstwirksamkeit range 7-24) — this catalog instead follows the clinic's Syntax_SBKJ.sps, which computes them as MEANS (0-6), matching the PSTB convention so every scale shares one y-axis regardless of item count. This is an intentional divergence from the published paper's reporting convention, not an error — flagging so it isn't 'corrected' back to sums later without realizing why.",
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
              // Stored data shown in the safety banner — German like all clinical content.
              message: "BDI-FS Suizid-Item bejaht (Item 7 ≥ 1) — bitte zeitnah mit der Patient*in besprechen.",
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
      // Placeholder "items" in partial/not_extracted catalog entries are prose
      // notes shaped like an item (e.g. { id: "CBCL_*", note: "..." }), not a
      // real renderable item — filter out anything that looks like a
      // placeholder (contains ".." or "*") rather than a concrete item id, so
      // "partial" instruments stay correctly inert instead of rendering one
      // bogus fillable field (found via audit 2026-07-03: cbcl_parent's
      // "CBCL_*" id slipped through the old ".."-only check).
      const items = Array.isArray(raw.items)
        ? likertItems(
            (raw.items as unknown[]).filter(
              (it): it is { id: string; reverseScored?: boolean; scaleMax?: number } =>
                typeof it === "object" &&
                it !== null &&
                "id" in it &&
                !/\.\.|\*/.test(String((it as { id: string }).id)),
            ),
            range,
          )
        : [];
      const scales = Array.isArray(raw.scales) ? normalizeScales(raw.scales as RawScale[]) : [];
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

// PHQ-4 (Patient Health Questionnaire-4): ultra-brief anxiety+depression
// screener, defined in code because the legacy system has no STANDALONE PHQ-4
// file — it lives inside the wave-based Standarddiagnostik batteries
// (docs/pipeline-coverage.md; legacy formula PHQ_total = SUM(PHQ1 TO PHQ4)).
// Administered EVERY SESSION here — a deliberate new clinic decision
// (2026-07-03) to create the session-wise symptom trajectory that Lutz-style
// outcome prediction needs (docs/outcome-prediction.md); the PSTB alone is a
// process measure. Item wording: validated German version (Löwe et al. 2010);
// the PHQ screeners are public domain (Pfizer — no permission required).
// Item ids PHQ1..PHQ4 follow the published form order (GAD-2 items first);
// [ASSUMED] the legacy battery columns PHQ1..PHQ4 use the same order — verify
// with the clinic before merging legacy PHQ data.
const PHQ4_STEM = "In den letzten 2 Wochen: ";
export const PHQ4: InstrumentDef = {
  id: "phq4",
  name: "Patient Health Questionnaire-4 (Kurzscreening Angst & Depression)",
  abbreviation: "PHQ-4",
  population: "adult_adolescent",
  raterRole: "self",
  instrumentType: "likert_battery",
  cadenceType: "every_session",
  cadenceConfig: {},
  definitionStatus: "complete",
  items: [
    { id: "PHQ1", text: `${PHQ4_STEM}Nervosität, Ängstlichkeit oder Anspannung` },
    { id: "PHQ2", text: `${PHQ4_STEM}Nicht in der Lage sein, Sorgen zu stoppen oder zu kontrollieren` },
    { id: "PHQ3", text: `${PHQ4_STEM}Wenig Interesse oder Freude an Ihren Tätigkeiten` },
    { id: "PHQ4", text: `${PHQ4_STEM}Niedergeschlagenheit, Schwermut oder Hoffnungslosigkeit` },
  ].map((it) => ({
    ...it,
    label: it.id,
    responseType: "likert" as const,
    min: 0,
    max: 3,
    minLabel: "überhaupt nicht",
    maxLabel: "beinahe jeden Tag",
  })),
  scales: [
    {
      key: "PHQ_total",
      label: "PHQ-4 Gesamtwert",
      formula: { type: "sum", items: ["PHQ1", "PHQ2", "PHQ3", "PHQ4"] },
      range: { min: 0, max: 12 },
      normBands: [
        { min: 0, max: 2, label: "unauffällig" },
        { min: 3, max: 5, label: "mild" },
        { min: 6, max: 8, label: "moderat" },
        { min: 9, max: 12, label: "schwer" },
      ],
      higherIsBetter: false,
      rci: {
        reliability: 0.82,
        sd: 2.5,
        note:
          "Reliability = Cronbachs Alpha .82 (Löwe et al. 2010, deutsche Bevölkerungsstichprobe); SD 2.5 an klinische Stichproben angenähert (Bevölkerungs-SD 2.1) — vor klinischer Interpretation gegen Klinikdaten prüfen. Schwelle ≈ 3 Punkte.",
      },
      sortOrder: 0,
    },
    {
      key: "GAD2",
      label: "GAD-2 (Angst)",
      formula: { type: "sum", items: ["PHQ1", "PHQ2"] },
      range: { min: 0, max: 6 },
      higherIsBetter: false,
      sortOrder: 1,
    },
    {
      key: "PHQ2_dep",
      label: "PHQ-2 (Depression)",
      formula: { type: "sum", items: ["PHQ3", "PHQ4"] },
      range: { min: 0, max: 6 },
      higherIsBetter: false,
      sortOrder: 2,
    },
  ],
  sourceNotes:
    "PHQ_total verified against legacy Standarddiagnostik syntax (SUM(PHQ1 TO PHQ4), see docs/pipeline-coverage.md). Norm bands 0-2/3-5/6-8/9-12 and the GAD-2/PHQ-2 subscales (screening cutoff >= 3 each) per Kroenke, Spitzer, Williams & Löwe (2009); German items Löwe et al. (2010), public-domain Pfizer PHQ screeners. Legacy cadence was wave-based inside the batteries; every-session administration is a new clinic decision (2026-07-03) for trajectory-based outcome monitoring — see docs/outcome-prediction.md. Answer anchors 0 'überhaupt nicht', 1 'an einzelnen Tagen', 2 'an mehr als der Hälfte der Tage', 3 'beinahe jeden Tag' (2-week window, stem prefixed to each item).",
};

/// All instrument definitions to seed: normalized catalog + the code-defined
/// clinic instruments (DIPS intake; session-wise PHQ-4). (The former
/// clinic-internal wellbeing_checkin was replaced by the real PSTB on
/// 2026-07-02 per clinic decision.)
export function loadInstrumentDefs(): InstrumentDef[] {
  const catalog = readCatalog();
  const normalized = catalog
    .map((raw) => normalizeEntry(raw, catalog))
    .filter((d): d is InstrumentDef => d !== null);
  return [DIPS_INTAKE, PHQ4, ...normalized];
}
