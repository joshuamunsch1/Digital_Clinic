// Diagnosis-specific questionnaire recommendations + clinical guideline
// references. Client-safe pure data + lookup.
//
// [clinician-confirm] EVERYTHING in this file is a prototype mapping compiled
// from the guideline/manual literature (AWMF register, SGAD, instrument
// manuals) and must be reviewed by the clinic before clinical use. Guideline
// currency is shown honestly (several S3 guidelines are expired/in revision).
//
// Lookup order: specific DIPS-derived diagnoses first (panic, agoraphobia,
// social anxiety, ...), then the patient's coarse disorderCategory as
// fallback/union. Catalog ids reference docs/instrument-catalog.json /
// src/lib/instruments/catalog.ts; instruments the clinic does not have yet are
// listed as external recommendations (German clinical naming).
import type { InstrumentDef } from "./instruments/types";
import type { DipsRecord } from "./types";
import { deriveDiagnoses, type DipsDiagnosisId } from "./dips/diagnosis";

export interface ExternalInstrumentRec {
  name: string; // German clinical name
  abbr?: string;
  note?: string; // German
}

export interface GuidelineRef {
  title: string;
  org: string;
  registryNr?: string;
  url: string;
  status?: string; // honest currency note, German
  summary: string; // first-line treatment summary, German
}

export interface RecommendationSet {
  /// A DipsDiagnosisId or a disorderCategory slug ("depression", ...).
  key: DipsDiagnosisId | string;
  /// German heading for the set (diagnosis or category name).
  labelDe: string;
  catalogInstrumentIds: string[];
  external: ExternalInstrumentRec[];
  guidelines: GuidelineRef[];
}

// ---- guideline references [clinician-confirm] ----------------------------------

const ANXIETY_GUIDELINES: GuidelineRef[] = [
  {
    title: "S3-Leitlinie Behandlung von Angststörungen",
    org: "AWMF (federführend DGPPN)",
    registryNr: "051-028",
    url: "https://register.awmf.org/de/leitlinien/detail/051-028",
    status: "Version 2.0 (2021), gültig",
    summary:
      "Patient*innen mit Angststörungen soll Psychotherapie und/oder Pharmakotherapie angeboten werden; " +
      "psychotherapeutisches Verfahren der ersten Wahl ist die kognitive Verhaltenstherapie (KVT), " +
      "mit Expositionsverfahren als zentralem Wirkbestandteil.",
  },
  {
    title: "Behandlungsempfehlungen für Angsterkrankungen (Schweiz)",
    org: "SGAD mit SGPP & SGBP",
    url: "https://www.sgad.ch/f%C3%BCr-fachleute/behandlungsempfehlungen",
    status: "Update 2024",
    summary:
      "Schweizer Fachgesellschafts-Empfehlung: Psychotherapie (1. Wahl KVT) und/oder Pharmakotherapie; " +
      "bei GAS kann bei Nichtansprechen oder Patientenpräferenz psychodynamische Psychotherapie angeboten werden.",
  },
];

const DEPRESSION_GUIDELINE: GuidelineRef = {
  title: "Nationale VersorgungsLeitlinie (S3) Unipolare Depression",
  org: "BÄK, KBV, AWMF (NVL-Programm)",
  registryNr: "nvl-005",
  url: "https://register.awmf.org/de/leitlinien/detail/nvl-005",
  status: "Version 3 (2022/2023), gültig",
  summary:
    "Bei leichter Depression niederschwellige Angebote und aktiv-abwartendes Vorgehen; bei mittelgradiger " +
    "Depression Psychotherapie gleichwertig zur Pharmakotherapie; bei schwerer Depression Kombination. " +
    "Beste Evidenz für KVT, IPT und psychodynamische Kurzzeittherapie. (Erwachsenen-fokussiert — für Kinder/" +
    "Jugendliche die DGKJP-Leitlinie heranziehen.)",
};

const EATING_GUIDELINE: GuidelineRef = {
  title: "S3-Leitlinie Diagnostik und Therapie der Essstörungen",
  org: "AWMF (DGPM/DGPPN/DGKJP/DGESS)",
  registryNr: "051-026",
  url: "https://register.awmf.org/de/leitlinien/detail/051-026",
  status: "2. Auflage (2018/2019) — abgelaufen, in Überarbeitung",
  summary:
    "Störungsspezifische Psychotherapie ist Behandlung der ersten Wahl; bei Bulimia nervosa und " +
    "Binge-Eating-Störung ist die KVT das am besten belegte Verfahren.",
};

const ADHD_GUIDELINE: GuidelineRef = {
  title: "S3-Leitlinie ADHS im Kindes-, Jugend- und Erwachsenenalter",
  org: "AWMF (DGKJP & DGPPN)",
  registryNr: "028-045",
  url: "https://register.awmf.org/de/leitlinien/detail/028-045",
  status: "Version 2.0 (2018) — abgelaufen, in Überarbeitung",
  summary:
    "Multimodales, an Schweregrad und Alter orientiertes Vorgehen: Psychoedukation und verhaltenstherapeutisch " +
    "fundierte psychosoziale Interventionen als Basis; bei ausgeprägter Symptomatik zusätzlich Pharmakotherapie.",
};

const BURNOUT_GUIDELINE: GuidelineRef = {
  title: "Burnout: keine eigenständige S3-Leitlinie",
  org: "WHO (ICD-11) / NVL-Programm",
  url: "https://icd.who.int/browse/2024-01/mms/en#129180281",
  status: "ICD-11 QD85 („occupational phenomenon“); ICD-10 Z73.0",
  summary:
    "Burnout ist keine eigenständige Krankheit, sondern in der ICD-11 (QD85) ein arbeitsbezogenes Phänomen " +
    "(Erschöpfung, mentale Distanz, reduzierte Leistungsfähigkeit; ICD-10: Z73.0). Es existiert keine " +
    "S3-Leitlinie — die Behandlung orientiert sich an der differentialdiagnostisch abzugrenzenden " +
    "(Erschöpfungs-)Depression, d. h. an der NVL Unipolare Depression.",
};

// ---- recommendation sets [clinician-confirm] ------------------------------------

const SETS: RecommendationSet[] = [
  // -------- specific DIPS-derived anxiety diagnoses --------
  {
    key: "panic_disorder",
    labelDe: "Panikstörung (F41.0)",
    catalogInstrumentIds: ["phq4"],
    external: [
      { name: "Fragebogen zu körperbezogenen Ängsten, Kognitionen und Vermeidung", abbr: "AKV (BSQ, ACQ, MI)", note: "Ehlers/Margraf — Standard-Verlaufsbatterie bei Panik/Agoraphobie" },
      { name: "Panik- und Agoraphobie-Skala", abbr: "PAS", note: "Bandelow — Schweregrad und Verlauf" },
      { name: "Generalized Anxiety Disorder Scale", abbr: "GAD-7", note: "generisches Angst-Monitoring" },
    ],
    guidelines: ANXIETY_GUIDELINES,
  },
  {
    key: "agoraphobia",
    labelDe: "Agoraphobie (F40.00/F40.01)",
    catalogInstrumentIds: ["phq4"],
    external: [
      { name: "Mobilitätsinventar", abbr: "MI", note: "Vermeidungsverhalten allein/in Begleitung — Teil der AKV" },
      { name: "Fragebogen zu körperbezogenen Ängsten, Kognitionen und Vermeidung", abbr: "AKV (BSQ, ACQ, MI)" },
      { name: "Panik- und Agoraphobie-Skala", abbr: "PAS" },
    ],
    guidelines: ANXIETY_GUIDELINES,
  },
  {
    key: "social_anxiety",
    labelDe: "Soziale Angststörung (F40.1)",
    catalogInstrumentIds: ["phq4"],
    external: [
      { name: "Liebowitz-Soziale-Angst-Skala", abbr: "LSAS" },
      { name: "Social Interaction Anxiety Scale / Social Phobia Scale", abbr: "SIAS/SPS", note: "SIAS-Kurzform ist Teil der Erwachsenen-Batterie der Klinik" },
      { name: "Soziale-Phobie-Inventar", abbr: "SPIN" },
    ],
    guidelines: ANXIETY_GUIDELINES,
  },
  {
    key: "specific_phobia",
    labelDe: "Spezifische Phobie (F40.2)",
    catalogInstrumentIds: ["phq4"],
    external: [
      { name: "Stimulus-spezifische Angstfragebögen (z. B. Spinnenangst-, Höhenangst-Skalen)", note: "kein breiter Standard-Selbstbericht; Verlauf meist über DIPS-Angst-/Vermeidungsratings" },
    ],
    guidelines: ANXIETY_GUIDELINES,
  },
  {
    key: "gad",
    labelDe: "Generalisierte Angststörung (F41.1)",
    catalogInstrumentIds: ["phq4"],
    external: [
      { name: "Generalized Anxiety Disorder Scale", abbr: "GAD-7", note: "primäres Schweregrad-/Verlaufsmaß" },
      { name: "Penn State Worry Questionnaire", abbr: "PSWQ", note: "sorgenspezifisch" },
    ],
    guidelines: ANXIETY_GUIDELINES,
  },
  {
    key: "separation_anxiety",
    labelDe: "Störung mit Trennungsangst (F93.0)",
    catalogInstrumentIds: ["phq4"],
    external: [
      { name: "Trennungsangst-Inventar (Erwachsene/Kinder)", note: "kein etabliertes Standardmaß — klinisch prüfen" },
    ],
    guidelines: ANXIETY_GUIDELINES,
  },
  // -------- disorderCategory fallbacks --------
  {
    key: "anxiety",
    labelDe: "Angststörungen (Kategorie)",
    catalogInstrumentIds: ["phq4"],
    external: [
      { name: "Generalized Anxiety Disorder Scale", abbr: "GAD-7" },
      { name: "Beck-Angst-Inventar", abbr: "BAI" },
    ],
    guidelines: ANXIETY_GUIDELINES,
  },
  {
    key: "depression",
    labelDe: "Depression (Kategorie)",
    catalogInstrumentIds: ["bdi_fs", "phq4", "dikj"],
    external: [
      { name: "Beck-Depressions-Inventar II (Vollversion)", abbr: "BDI-II", note: "Standard-Outcome-Maß (Erwachsene)" },
      { name: "Patient Health Questionnaire-9", abbr: "PHQ-9" },
      { name: "DISYPS-III Depressionsskalen (FBB-/SBB-DES)", note: "Kinder/Jugendliche" },
    ],
    guidelines: [DEPRESSION_GUIDELINE],
  },
  {
    key: "eating_disorder",
    labelDe: "Essstörungen (Kategorie)",
    catalogInstrumentIds: ["edeq8", "wbq"],
    external: [
      { name: "Eating Disorder Examination-Questionnaire (Vollversion, 28 Items)", abbr: "EDE-Q", note: "S3-empfohlener Selbstbericht" },
      { name: "Eating Disorder Inventory-3", abbr: "EDI-3" },
    ],
    guidelines: [EATING_GUIDELINE],
  },
  {
    key: "adhd",
    labelDe: "ADHS (Kategorie)",
    catalogInstrumentIds: ["conners3_self_short", "cbcl_parent", "ysr_self", "sdq_self_11_17", "sdq_parent_4_17"],
    external: [
      { name: "DISYPS-III ADHS-Skalen (FBB-/SBB-ADHS)", note: "Kinder/Jugendliche — Eltern-, Selbst- und Lehrerurteil" },
      { name: "ADHS-Selbstbeurteilungsskala", abbr: "ADHS-SB", note: "Erwachsene (Rösler)" },
      { name: "Wender Utah Rating Scale (Kurzform)", abbr: "WURS-k", note: "retrospektive Kindheitssymptomatik, Erwachsene" },
      { name: "Conners Adult ADHD Rating Scales", abbr: "CAARS", note: "Erwachsene — Conners 3 der Klinik ist die Jugendversion" },
    ],
    guidelines: [ADHD_GUIDELINE],
  },
  {
    key: "burnout",
    labelDe: "Burnout / Erschöpfung (Kategorie)",
    // deliberately NO catalog ids: the catalog's "wbq" is a BINGE-EATING
    // questionnaire (naming collision) and must not be mapped to burnout.
    catalogInstrumentIds: [],
    external: [
      { name: "Maslach Burnout Inventory (deutsche Fassung)", abbr: "MBI-D / MBI-GS-D" },
      { name: "Burnout-Screening-Skalen", abbr: "BOSS" },
      { name: "Oldenburg Burnout Inventory", abbr: "OLBI" },
      { name: "BDI-II / PHQ-9 zur Abklärung der Depressions-Überlappung", note: "Differentialdiagnostik" },
    ],
    guidelines: [BURNOUT_GUIDELINE, DEPRESSION_GUIDELINE],
  },
];

const byKey = new Map(SETS.map((s) => [s.key, s]));

// ---- lookup ---------------------------------------------------------------------

export interface RecommendationInput {
  disorderCategory: string | null;
  dips: DipsRecord | null;
}

/// Specific DIPS-derived diagnoses first, then the coarse category as
/// fallback/union (deduplicated; the category set is skipped when a specific
/// set with the same guideline focus already covers it — i.e. anxiety category
/// is omitted when a specific anxiety diagnosis matched).
export function recommendationsForPatient(p: RecommendationInput): RecommendationSet[] {
  const out: RecommendationSet[] = [];
  if (p.dips) {
    for (const evaluation of deriveDiagnoses(p.dips.answers)) {
      const set = byKey.get(evaluation.diagnosis);
      if (set && !out.includes(set)) out.push(set);
    }
  }
  if (p.disorderCategory) {
    const categorySet = byKey.get(p.disorderCategory);
    const anxietyCovered = p.disorderCategory === "anxiety" && out.length > 0;
    if (categorySet && !anxietyCovered && !out.includes(categorySet)) out.push(categorySet);
  }
  return out;
}

/// Catalog instrument ids recommended for this patient, restricted to
/// instruments that actually exist in the loaded catalog.
export function recommendedInstrumentIds(p: RecommendationInput, instruments: InstrumentDef[]): Set<string> {
  const known = new Set(instruments.map((i) => i.id));
  const out = new Set<string>();
  for (const set of recommendationsForPatient(p)) {
    for (const id of set.catalogInstrumentIds) if (known.has(id)) out.add(id);
  }
  return out;
}
