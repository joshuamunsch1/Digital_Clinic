// Mechanical DIPS evaluation: rule-based diagnosis PROPOSALS derived from the
// interview answers, per module. Pure and client-safe — recomputed on the fly
// from the stored DIPS ResponseInstance, never persisted.
//
// The rule shape follows the DIPS/DIPS-OA tradition (Margraf, Cwik, Suppiger &
// Schneider, RUB Bochum; ADIS lineage): screening positive → symptom-count
// criteria → clinical significance (impairment/distress) → duration →
// substance/organic exclusions. Every output is a "Vorschlag" for clinician
// confirmation, never an automatic diagnosis.
//
// [clinician-confirm] The exact DIPS-OA numeric thresholds could not be
// verified against the manual — the constants below follow the ADIS convention
// (clinical significance ≥ 4 on 0–8 scales; ≥ 2 on the 0–3 severity grids) and
// must be checked against the DIPS-OA protocol before clinical use.
import { L, tr, type LangNode } from "../i18n";
import type { DipsAnswers, ModuleAnswers } from "../types";
import type { GridRow, Item } from "./types";
import {
  MODULES,
  PD_KEYS,
  afterPdShown,
  gadFull,
  gadSymCount,
  hasPanic,
  pdShown,
  sepFull,
  sepSymCount,
  symCount,
} from "./schema";

/// Clinical-significance cut on the 0–8 impairment/distress scales. [clinician-confirm]
export const IMPACT_CLINICAL = 4;
/// Clinical-severity cut on the 0–3 fear/avoidance grids. [clinician-confirm]
export const SEV_CLINICAL = 2;

export type DipsDiagnosisId =
  | "panic_disorder"
  | "agoraphobia"
  | "social_anxiety"
  | "specific_phobia"
  | "gad"
  | "separation_anxiety";

export interface CriterionCheck {
  key: string;
  label: LangNode;
  met: boolean;
  detail?: string; // German clinical detail (endorsed situations, counts, ratings)
}

/// Full evaluation of one DIPS module against its diagnosis rule.
export interface ModuleEvaluation {
  moduleId: string; // "panic" | "agora" | "social" | "phobia" | "gad" | "sep"
  diagnosis: DipsDiagnosisId;
  icdCode: string;
  label: LangNode; // trilingual diagnosis name (clinical German first)
  entered: boolean; // screening positive (module was entered)
  met: boolean; // all criteria below met — a proposal
  criteria: CriterionCheck[];
  caveats: LangNode[];
  suggestedText: string; // German pre-fill for the diagnosis field
}

// ---- answer-shape helpers -----------------------------------------------------

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const impactMet = (m: ModuleAnswers) =>
  (num(m["impact_impair"]) ?? 0) >= IMPACT_CLINICAL || (num(m["impact_distress"]) ?? 0) >= IMPACT_CLINICAL;

const impactDetail = (m: ModuleAnswers) =>
  `Beeinträchtigung ${num(m["impact_impair"]) ?? "—"} / Belastung ${num(m["impact_distress"]) ?? "—"} (0–8)`;

const impactSum = (m: ModuleAnswers) => (num(m["impact_impair"]) ?? 0) + (num(m["impact_distress"]) ?? 0);

/// Find a grid item inside a module definition (for its row groups).
function gridItem(moduleId: string, itemId: string): Item | null {
  const mod = MODULES.find((x) => x.id === moduleId);
  if (!mod) return null;
  for (const sec of mod.sections) {
    const it = sec.items.find((x) => x.id === itemId && x.type === "grid");
    if (it) return it;
  }
  return null;
}

/// A grid row endorsed at clinical level: primary "yes" AND (severity ≥ cut OR avoided).
function clinicalRow(m: ModuleAnswers, gridId: string, rowKey: string): boolean {
  if (m[`${gridId}_${rowKey}_primary`] !== "yes") return false;
  const sev = num(m[`${gridId}_${rowKey}_sev`]);
  return (sev !== null && sev >= SEV_CLINICAL) || m[`${gridId}_${rowKey}_avoid`] === "yes";
}

function clinicalRowsOf(m: ModuleAnswers, moduleId: string, gridId: string): GridRow[] {
  const it = gridItem(moduleId, gridId);
  if (!it?.groups) return [];
  return it.groups.flatMap((g) => g.rows).filter((r) => clinicalRow(m, gridId, r.key));
}

/// How many of the grid's situation CATEGORIES (groups) have a clinical-level row —
/// mirrors the DSM-5 agoraphobia "≥ 2 of 5 situation categories" structure.
function clinicalGroupCount(m: ModuleAnswers, moduleId: string, gridId: string): number {
  const it = gridItem(moduleId, gridId);
  if (!it?.groups) return 0;
  return it.groups.filter((g) => g.rows.some((r) => clinicalRow(m, gridId, r.key))).length;
}

const rowNames = (rows: GridRow[]) => rows.map((r) => tr(r.label, "de")).join(", ");

// ---- shared criterion/caveat builders -----------------------------------------

const impactCriterion = (m: ModuleAnswers): CriterionCheck => ({
  key: "impact",
  label: L(
    `Klinisch bedeutsame Beeinträchtigung oder Belastung (≥ ${IMPACT_CLINICAL} von 8)`,
    `Altération ou détresse cliniquement significative (≥ ${IMPACT_CLINICAL} sur 8)`,
    `Clinically significant impairment or distress (≥ ${IMPACT_CLINICAL} of 8)`,
  ),
  met: impactMet(m),
  detail: impactDetail(m),
});

function exclusionCaveats(m: ModuleAnswers): LangNode[] {
  const out: LangNode[] = [];
  if (m["organic"] === "yes")
    out.push(L(
      "Körperliche Erkrankung als mögliche Ursache angegeben — organische Abklärung erforderlich.",
      "Une affection physique est indiquée comme cause possible — bilan somatique requis.",
      "A physical condition was reported as a possible cause — organic work-up required.",
    ));
  if (m["subst1"] === "yes" || m["subst2"] === "yes")
    out.push(L(
      "Substanzeinnahme (Medikamente/Drogen/Alkohol) könnte die Symptome (mit)verursachen.",
      "La prise de substances (médicaments/drogues/alcool) pourrait (co)causer les symptômes.",
      "Substance use (medication/drugs/alcohol) could (co-)cause the symptoms.",
    ));
  if (m["approp"] === "yes")
    out.push(L(
      "Die Angst wird als situationsangemessen beurteilt — DSM-Kriterium „unverhältnismäßige Angst“ prüfen.",
      "La peur est jugée appropriée à la situation — vérifier le critère DSM « peur disproportionnée ».",
      "The fear is judged appropriate to the situation — check the DSM criterion of disproportionate fear.",
    ));
  return out;
}

const suggested = (nameDe: string, icd: string) =>
  `${nameDe} (ICD-10 ${icd}) — DIPS-gestützter Vorschlag, klinisch zu bestätigen`;

// ---- per-module rules ----------------------------------------------------------

function evalPanic(m: ModuleAnswers): ModuleEvaluation {
  const criteria: CriterionCheck[] = [
    {
      key: "attacks",
      label: L(
        "Wiederkehrende unerwartete Panikanfälle (Höhepunkt in Minuten, ≥ 4 Symptome)",
        "Attaques de panique inattendues récurrentes (pic en quelques minutes, ≥ 4 symptômes)",
        "Recurrent unexpected panic attacks (peak within minutes, ≥ 4 symptoms)",
      ),
      met: pdShown(m),
      detail: `${symCount(m)} von 13 Paniksymptomen bejaht`,
    },
    {
      key: "consequences",
      label: L(
        "≥ 1 Monat anhaltende Sorge über weitere Anfälle / Folgen oder Verhaltensänderung",
        "≥ 1 mois d'inquiétude concernant d'autres attaques / leurs conséquences ou changement de comportement",
        "≥ 1 month of worry about further attacks / their consequences, or behaviour change",
      ),
      met: afterPdShown(m),
      detail: PD_KEYS.filter((k) => m[k] === "yes").length + " Folgekriterien bejaht",
    },
    impactCriterion(m),
  ];
  return {
    moduleId: "panic",
    diagnosis: "panic_disorder",
    icdCode: "F41.0",
    label: L("Panikstörung", "Trouble panique", "Panic disorder"),
    entered: hasPanic(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats: exclusionCaveats(m),
    suggestedText: suggested("Panikstörung", "F41.0"),
  };
}

function evalAgora(m: ModuleAnswers, panicMet: boolean): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "agora")!;
  const groups = clinicalGroupCount(m, "agora", "grid");
  const rows = clinicalRowsOf(m, "agora", "grid");
  const icdCode = panicMet ? "F40.01" : "F40.00";
  const criteria: CriterionCheck[] = [
    {
      key: "screen",
      label: L(
        "Angst/Vermeidung wegen erschwerter Flucht oder fehlender Hilfe",
        "Peur/évitement par crainte de ne pouvoir fuir ou être secouru(e)",
        "Fear/avoidance because escape would be difficult or help unavailable",
      ),
      met: mod.enter(m),
    },
    {
      key: "situations",
      label: L(
        `Deutliche Angst in ≥ 2 von 5 Situationskategorien (Stärke ≥ ${SEV_CLINICAL} oder Vermeidung)`,
        `Peur marquée dans ≥ 2 des 5 catégories de situations (intensité ≥ ${SEV_CLINICAL} ou évitement)`,
        `Marked fear in ≥ 2 of 5 situation categories (severity ≥ ${SEV_CLINICAL} or avoidance)`,
      ),
      met: groups >= 2,
      detail: rows.length ? `${groups} Kategorien: ${rowNames(rows)}` : undefined,
    },
    {
      key: "duration",
      label: L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
      met: m["dur6"] === "yes",
    },
    impactCriterion(m),
  ];
  const caveats = exclusionCaveats(m);
  if (panicMet)
    caveats.push(L(
      "Kombination mit Panikstörung — ICD-10 kodiert F40.01 (Agoraphobie mit Panikstörung).",
      "Combinaison avec un trouble panique — CIM-10 : F40.01 (agoraphobie avec trouble panique).",
      "Combined with panic disorder — ICD-10 codes this as F40.01 (agoraphobia with panic disorder).",
    ));
  return {
    moduleId: "agora",
    diagnosis: "agoraphobia",
    icdCode,
    label: L("Agoraphobie", "Agoraphobie", "Agoraphobia"),
    entered: mod.enter(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats,
    suggestedText: suggested(panicMet ? "Agoraphobie mit Panikstörung" : "Agoraphobie", icdCode),
  };
}

function evalSocial(m: ModuleAnswers): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "social")!;
  const rows = clinicalRowsOf(m, "social", "grid");
  const criteria: CriterionCheck[] = [
    {
      key: "screen",
      label: L(
        "Ausgeprägte Angst vor sozialen Situationen mit Bewertungsangst",
        "Peur marquée des situations sociales avec crainte du jugement",
        "Marked fear of social situations with fear of negative evaluation",
      ),
      met: mod.enter(m),
    },
    {
      key: "situations",
      label: L(
        `Deutliche Angst/Vermeidung in sozialen Situationen (Stärke ≥ ${SEV_CLINICAL} oder Vermeidung)`,
        `Peur/évitement marqués dans des situations sociales (intensité ≥ ${SEV_CLINICAL} ou évitement)`,
        `Marked fear/avoidance in social situations (severity ≥ ${SEV_CLINICAL} or avoidance)`,
      ),
      met: rows.length >= 1,
      detail: rows.length ? rowNames(rows) : undefined,
    },
    {
      key: "immediate",
      label: L(
        "Die Angst tritt in den Situationen (nahezu) sofort auf",
        "La peur survient (presque) immédiatement dans les situations",
        "The fear arises (almost) immediately in the situations",
      ),
      met: m["6"] === "yes",
    },
    {
      key: "duration",
      label: L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
      met: m["4.2"] === "yes",
    },
    impactCriterion(m),
  ];
  return {
    moduleId: "social",
    diagnosis: "social_anxiety",
    icdCode: "F40.1",
    label: L("Soziale Angststörung (Soziale Phobie)", "Trouble d'anxiété sociale", "Social anxiety disorder"),
    entered: mod.enter(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats: exclusionCaveats(m),
    suggestedText: suggested("Soziale Angststörung", "F40.1"),
  };
}

function evalPhobia(m: ModuleAnswers): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "phobia")!;
  const rows = clinicalRowsOf(m, "phobia", "grid");
  const criteria: CriterionCheck[] = [
    {
      key: "screen",
      label: L(
        "Intensive Furcht vor spezifischen Objekten oder Situationen",
        "Peur intense d'objets ou de situations spécifiques",
        "Intense fear of specific objects or situations",
      ),
      met: mod.enter(m),
    },
    {
      key: "stimuli",
      label: L(
        `Deutliche Angst/Vermeidung bei ≥ 1 Stimulus (Stärke ≥ ${SEV_CLINICAL} oder Vermeidung)`,
        `Peur/évitement marqués pour ≥ 1 stimulus (intensité ≥ ${SEV_CLINICAL} ou évitement)`,
        `Marked fear/avoidance for ≥ 1 stimulus (severity ≥ ${SEV_CLINICAL} or avoidance)`,
      ),
      met: rows.length >= 1,
      detail: rows.length ? rowNames(rows) : undefined,
    },
    {
      key: "duration",
      label: L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
      met: m["dur6"] === "yes",
    },
    impactCriterion(m),
  ];
  return {
    moduleId: "phobia",
    diagnosis: "specific_phobia",
    icdCode: "F40.2",
    label: L("Spezifische Phobie", "Phobie spécifique", "Specific phobia"),
    entered: mod.enter(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats: exclusionCaveats(m),
    suggestedText: suggested("Spezifische Phobie", "F40.2"),
  };
}

function evalGad(m: ModuleAnswers): ModuleEvaluation {
  const criteria: CriterionCheck[] = [
    {
      key: "screen",
      label: L(
        "Übermäßige Sorgen an der Mehrzahl der Tage über ≥ 6 Monate",
        "Inquiétudes excessives la plupart des jours pendant ≥ 6 mois",
        "Excessive worry on most days for ≥ 6 months",
      ),
      met: m["1.1"] === "yes",
    },
    {
      key: "uncontrollable",
      label: L(
        "Die Sorgen sind schwer zu kontrollieren",
        "Les inquiétudes sont difficiles à contrôler",
        "The worries are difficult to control",
      ),
      met: m["1.3"] === "yes",
    },
    {
      key: "symptoms",
      label: L(
        "≥ 3 Begleitsymptome (Ruhelosigkeit, Ermüdbarkeit, Konzentration, Reizbarkeit, Anspannung, Schlaf)",
        "≥ 3 symptômes associés (agitation, fatigabilité, concentration, irritabilité, tension, sommeil)",
        "≥ 3 accompanying symptoms (restlessness, fatigue, concentration, irritability, tension, sleep)",
      ),
      met: gadFull(m),
      detail: `${gadSymCount(m)} von 6 Symptomen bejaht`,
    },
    impactCriterion(m),
  ];
  return {
    moduleId: "gad",
    diagnosis: "gad",
    icdCode: "F41.1",
    label: L("Generalisierte Angststörung", "Trouble d'anxiété généralisée", "Generalised anxiety disorder"),
    entered: m["1.1"] === "yes",
    met: criteria.every((c) => c.met),
    criteria,
    caveats: exclusionCaveats(m),
    suggestedText: suggested("Generalisierte Angststörung", "F41.1"),
  };
}

function evalSep(m: ModuleAnswers): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "sep")!;
  const criteria: CriterionCheck[] = [
    {
      key: "screen",
      label: L(
        "Starke Angst vor Trennung von Bezugspersonen",
        "Peur intense de la séparation d'avec les figures d'attachement",
        "Strong fear of separation from attachment figures",
      ),
      met: mod.enter(m),
    },
    {
      key: "symptoms",
      label: L(
        "≥ 3 Trennungsangst-Symptome",
        "≥ 3 symptômes d'anxiété de séparation",
        "≥ 3 separation-anxiety symptoms",
      ),
      met: sepFull(m),
      detail: `${sepSymCount(m)} von 8 Symptomen bejaht`,
    },
    {
      key: "duration",
      label: L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
      met: m["4.2"] === "yes",
    },
    impactCriterion(m),
  ];
  const caveats = exclusionCaveats(m);
  caveats.push(L(
    "Kodierung F93.0 stammt aus dem Kindes-/Jugendbereich — Kodierung im Erwachsenenalter prüfen.",
    "Le code F93.0 provient de la classification enfant/adolescent — vérifier le codage à l'âge adulte.",
    "The F93.0 code stems from the child/adolescent classification — verify coding for adults.",
  ));
  return {
    moduleId: "sep",
    diagnosis: "separation_anxiety",
    icdCode: "F93.0",
    label: L("Störung mit Trennungsangst", "Trouble d'anxiété de séparation", "Separation anxiety disorder"),
    entered: mod.enter(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats,
    suggestedText: suggested("Störung mit Trennungsangst", "F93.0"),
  };
}

// ---- public API ----------------------------------------------------------------

/// Evaluate every DIPS module (also the ones that did not screen positive) —
/// the DiagnosisView shows the full breakdown including near-misses.
export function evaluateDips(answers: DipsAnswers): ModuleEvaluation[] {
  const m = (id: string): ModuleAnswers => answers[id] ?? {};
  const panic = evalPanic(m("panic"));
  return [
    panic,
    evalAgora(m("agora"), panic.met),
    evalSocial(m("social")),
    evalPhobia(m("phobia")),
    evalGad(m("gad")),
    evalSep(m("sep")),
  ];
}

/// Only the modules whose full rule is met — the diagnosis proposals.
export function deriveDiagnoses(answers: DipsAnswers): ModuleEvaluation[] {
  return evaluateDips(answers).filter((e) => e.met);
}

/// The single proposal used to pre-fill the diagnosis field: the met module
/// with the highest impairment+distress sum (ties: module order).
export function primaryProposal(answers: DipsAnswers): ModuleEvaluation | null {
  const met = deriveDiagnoses(answers);
  if (!met.length) return null;
  return met.reduce((best, e) =>
    impactSum(answers[e.moduleId] ?? {}) > impactSum(answers[best.moduleId] ?? {}) ? e : best,
  );
}
