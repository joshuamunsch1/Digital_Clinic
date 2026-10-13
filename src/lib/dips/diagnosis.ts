// Mechanical DIPS evaluation: rule-based diagnosis PROPOSALS derived from the
// interview answers, per module. Pure and client-safe — recomputed on the fly
// from the stored DIPS ResponseInstance, never persisted.
//
// The rules follow the criterion mapping printed in the margin of the DIPS
// Open Access 1.2 Protokollbogen (Margraf, Cwik, von Brachel, Suppiger &
// Schneider, 2021; pp. 297–311), which assigns the starred interview items to
// the DSM-5 criteria of each disorder. Every output is a "Vorschlag" for
// clinician confirmation, never an automatic diagnosis; the criteria the DIPS
// leaves to differential-diagnostic judgement (exclusion of other disorders,
// substance/organic causes) are surfaced as caveats, not decided here.
//
// Three things are this engine's own operationalisation, not the manual's:
//   • [clinician-confirm] SEV_CLINICAL — the DIPS only says the interviewer
//     ticks "Angst" for a feared situation; the optional 0–3 rating is used
//     here to discount a situation explicitly rated below "starke Angst".
//   • ICD-10 (WHO/GM) codes. The Protokollbogen prints the DSM-5 code set
//     (F40.00, F40.10, F40.2xx with subtype digits, F41.0, F41.1, F93.0) and
//     under DSM-5 panic disorder and agoraphobia are two diagnoses; ICD-10
//     folds them into F40.01, which is what is proposed here.
//   • The age-banded DSM-5 criteria for minors (EvalContext) — the DIPS Open
//     Access is the adult interview; children belong in the Kinder-DIPS.
import { L, tr, type LangNode } from "../i18n";
import type { DipsAnswers, ModuleAnswers } from "../types";
import type { GridRow, Item } from "./types";
import { effectiveAnswers } from "./engine";
import {
  MODULES,
  PD_KEYS,
  SOCIAL_PERFORMANCE_ROWS,
  afterPdShown,
  gadCurrent,
  gadPast,
  gadSomeMajority,
  gadSymCount,
  hasPanic,
  panicCurrent,
  pdShown,
  sepSymCount,
  symCount,
} from "./schema";

/// Clinical cut on the 0–8 scales: impairment/distress ("≥ 4 ist als klinisch
/// relevant zu bewerten") and the severity rating of a diagnosis (0–3
/// subclinical, 4–8 clinical range).
export const IMPACT_CLINICAL = 4;

/// Patient context for age-banded DSM-5 criteria (child GAD symptom count,
/// child separation-anxiety duration). Absent/unknown age applies the adult
/// thresholds — the stricter reading, never the looser one.
export interface EvalContext {
  age?: number | null;
}
const isChild = (ctx?: EvalContext) => ctx?.age != null && Number.isFinite(ctx.age) && ctx.age < 18;
/// A checklist situation explicitly rated below this on the 0–3 scale (and not
/// avoided) is not counted as marked fear. [clinician-confirm]
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
  /// All DIPS modules cover the anxiety spectrum.
  disorderCategory: "anxiety";
  icdCode: string;
  label: LangNode; // trilingual diagnosis name (clinical German first)
  entered: boolean; // screening positive (module was entered)
  met: boolean; // all criteria below met — a proposal
  /// Criteria met, but the ICD-10 code is subsumed by another met diagnosis
  /// (panic disorder inside F40.01) — shown, but not proposed separately.
  suppressed?: boolean;
  criteria: CriterionCheck[];
  caveats: LangNode[];
  suggestedText: string; // German pre-fill for the diagnosis field
}

// ---- answer-shape helpers -----------------------------------------------------

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/// Severity rating of the diagnosis (0–8), when the interviewer recorded one.
const clinicianSeverity = (m: ModuleAnswers): number | null => num(m["clinsev_sev"]);

const impair = (m: ModuleAnswers) => num(m["impact_impair"]);
const distress = (m: ModuleAnswers) => num(m["impact_distress"]);
const impactRated = (m: ModuleAnswers) => impair(m) !== null || distress(m) !== null;

/// DSM-5 distress/impairment criterion ("Leidensdruck"): the interviewer's
/// 0–8 ratings of impairment and distress, either one >= 4 (the DSM asks for
/// distress OR impairment). Interviews recorded before these ratings became
/// mandatory may carry only the diagnosis severity rating, which then stands in.
const impactMet = (m: ModuleAnswers) =>
  impactRated(m)
    ? (impair(m) ?? 0) >= IMPACT_CLINICAL || (distress(m) ?? 0) >= IMPACT_CLINICAL
    : (clinicianSeverity(m) ?? 0) >= IMPACT_CLINICAL;

const impactDetail = (m: ModuleAnswers) => `Beeinträchtigung ${impair(m) ?? "—"} / Belastung ${distress(m) ?? "—"} (0–8)`;

const impactSum = (m: ModuleAnswers) => (impair(m) ?? 0) + (distress(m) ?? 0);

/// Ranking value for the primary-diagnosis pick: the severity rating when
/// present (DIPS: the primary diagnosis is the most severe one), else the
/// impairment/distress ratings mapped onto the same 0–8 range.
const severityRank = (m: ModuleAnswers): number => clinicianSeverity(m) ?? impactSum(m) / 2;

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

/// A checklist row counted as marked fear: "Angst" ticked, and not explicitly
/// rated below SEV_CLINICAL without avoidance. An unrated row counts — the
/// 0–3 rating is optional in the DIPS, the tick is the starred answer.
function clinicalRow(m: ModuleAnswers, gridId: string, rowKey: string): boolean {
  if (m[`${gridId}_${rowKey}_primary`] !== "yes") return false;
  const sev = num(m[`${gridId}_${rowKey}_sev`]);
  return m[`${gridId}_${rowKey}_avoid`] === "yes" || sev === null || sev >= SEV_CLINICAL;
}

function clinicalRowsOf(m: ModuleAnswers, moduleId: string, gridId: string): GridRow[] {
  const it = gridItem(moduleId, gridId);
  if (!it?.groups) return [];
  return it.groups.flatMap((g) => g.rows).filter((r) => clinicalRow(m, gridId, r.key));
}

/// Indices of the grid's situation areas (groups) with a counted row —
/// agoraphobia needs two of the five, the phobia subtype is the group.
function clinicalGroups(m: ModuleAnswers, moduleId: string, gridId: string): number[] {
  const it = gridItem(moduleId, gridId);
  if (!it?.groups) return [];
  return it.groups.flatMap((g, i) => (g.rows.some((r) => clinicalRow(m, gridId, r.key)) ? [i] : []));
}

/// Row name for the criterion detail; free-text rows ("Andere", "Tier 1")
/// show what the interviewer specified.
const rowNames = (m: ModuleAnswers, gridId: string, rows: GridRow[]) =>
  rows
    .map((r) => {
      const spec = r.specify ? String(m[`${gridId}_${r.key}_spec`] ?? "").trim() : "";
      return spec || tr(r.label, "de");
    })
    .join(", ");

// ---- shared criterion/caveat builders -----------------------------------------

const impactCriterion = (m: ModuleAnswers): CriterionCheck => ({
  key: "impact",
  label: L(
    `Leidensdruck: Beeinträchtigung oder Belastung ≥ ${IMPACT_CLINICAL} (0–8)`,
    `Souffrance : altération ou détresse ≥ ${IMPACT_CLINICAL} (0–8)`,
    `Distress: impairment or distress ≥ ${IMPACT_CLINICAL} (0–8)`,
  ),
  met: impactMet(m),
  detail: impactRated(m) ? impactDetail(m) : clinicianSeverity(m) !== null ? "nicht erhoben — ersatzweise Schweregrad-Rating" : "nicht erhoben",
});

/// Only when the interviewer rated the diagnosis: a rating in the subclinical
/// range (0–3) is not proposed as a diagnosis.
const severityCriteria = (m: ModuleAnswers): CriterionCheck[] => {
  const sev = clinicianSeverity(m);
  if (sev === null) return [];
  return [{
    key: "severity",
    label: L(
      `Schweregrad der Diagnose im klinischen Bereich (≥ ${IMPACT_CLINICAL} von 8)`,
      `Sévérité du diagnostic dans le domaine clinique (≥ ${IMPACT_CLINICAL} sur 8)`,
      `Severity of the diagnosis in the clinical range (≥ ${IMPACT_CLINICAL} of 8)`,
    ),
    met: sev >= IMPACT_CLINICAL,
    detail: `Schweregrad-Rating ${sev} (Therapeut*in)`,
  }];
};

/// The DIPS codes every diagnosis "aktuell" vs. "früher". The engine only ever
/// proposes CURRENT diagnoses: the module's current-branch screen must be
/// positive; a lifetime-only presentation fails this criterion (and gets an
/// explanatory caveat) instead of silently producing a present-tense proposal.
const currencyCriterion = (current: boolean): CriterionCheck => ({
  key: "current",
  label: L(
    "Aktuell vorhanden (nicht nur früher)",
    "Actuellement présent (pas seulement par le passé)",
    "Currently present (not only in the past)",
  ),
  met: current,
});

/// DSM-5 "out of proportion": the interviewer judged the fear NOT appropriate
/// to the situation. Unanswered (interviews predating the item) is not met.
const disproportionCriterion = (m: ModuleAnswers): CriterionCheck => ({
  key: "disproportionate",
  label: L(
    "Angst unverhältnismäßig (nicht situations-/soziokulturell angemessen)",
    "Peur disproportionnée (non appropriée à la situation/au contexte socioculturel)",
    "Fear out of proportion (not appropriate to the situation/sociocultural context)",
  ),
  met: m["approp"] === "no",
  detail: m["approp"] === undefined ? "nicht erhoben" : m["approp"] === "yes" ? "als angemessen beurteilt" : undefined,
});

const durationCriterion = (met: boolean, child = false): CriterionCheck => ({
  key: "duration",
  label: child
    ? L("Dauer mindestens 4 Wochen (Kinder/Jugendliche)", "Durée d'au moins 4 semaines (enfants/adolescents)", "Duration of at least 4 weeks (children/adolescents)")
    : L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
  met,
});

const LIFETIME_CAVEAT = L(
  "Nur frühere Episode(n) berichtet — kein aktueller Diagnosevorschlag; ggf. als frühere Diagnose dokumentieren.",
  "Seuls des épisodes antérieurs sont rapportés — pas de proposition de diagnostic actuel ; documenter le cas échéant comme diagnostic antérieur.",
  "Only past episode(s) reported — no current diagnosis proposal; document as a past diagnosis if appropriate.",
);

function exclusionCaveats(m: ModuleAnswers): LangNode[] {
  const out: LangNode[] = [];
  if (m["organic"] === "yes")
    out.push(L(
      "Körperliche Erkrankung als mögliche Ursache angegeben — organische Abklärung erforderlich.",
      "Une affection physique est indiquée comme cause possible — bilan somatique requis.",
      "A physical condition was reported as a possible cause — organic work-up required.",
    ));
  if (m["subst2"] === "yes")
    out.push(L(
      "Einnahme/Entzug von Substanzen verursacht möglicherweise die Symptome — substanz-/medikamenteninduzierte Angststörung abklären (Konsum/Entzug im letzten Monat?).",
      "La prise/le sevrage de substances pourrait causer les symptômes — écarter un trouble anxieux induit par une substance/un médicament (consommation/sevrage le mois dernier ?).",
      "Substance use/withdrawal possibly causes the symptoms — rule out a substance/medication-induced anxiety disorder (use/withdrawal in the past month?).",
    ));
  else if (m["subst1"] === "yes" && m["subst2"] === undefined)
    out.push(L(
      "Substanzeinnahme (Medikamente/Drogen/Koffein/Alkohol) angegeben — Zusammenhang mit den Symptomen nicht beurteilt.",
      "Prise de substances (médicaments/drogues/caféine/alcool) indiquée — lien avec les symptômes non évalué.",
      "Substance use (medication/drugs/caffeine/alcohol) reported — its relation to the symptoms was not assessed.",
    ));
  return out;
}

const suggested = (nameDe: string, icd: string) =>
  `${nameDe} (ICD-10 ${icd}) — DIPS-gestützter Vorschlag, klinisch zu bestätigen`;

const met = (criteria: CriterionCheck[]) => criteria.every((c) => c.met);

// ---- per-module rules ----------------------------------------------------------

function evalPanic(m: ModuleAnswers): ModuleEvaluation {
  const current = panicCurrent(m);
  // Criteria A and B. Unlike the other anxiety disorders, panic disorder has
  // no distress/impairment criterion (item 17 is unstarred) — only a
  // subclinical severity rating keeps a met A + B from being proposed.
  const criteria: CriterionCheck[] = [
    currencyCriterion(current),
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
    ...severityCriteria(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && hasPanic(m)) caveats.push(LIFETIME_CAVEAT);
  // Item 6 (attacks per month) is optional in the interview, so it is a caveat
  // rather than a hard criterion — but an explicit 0 contradicts "recurrent".
  const freq = num(m["6"]) ?? (typeof m["6"] === "string" && m["6"].trim() !== "" ? Number(m["6"]) : null);
  if (freq !== null && Number.isFinite(freq) && freq <= 0)
    caveats.push(L(
      "Anfallsfrequenz 0/Monat angegeben — DSM-Kriterium „wiederkehrende Panikattacken“ prüfen.",
      "Fréquence d'attaques indiquée : 0/mois — vérifier le critère DSM « attaques de panique récurrentes ».",
      "Attack frequency of 0/month reported — check the DSM criterion of recurrent panic attacks.",
    ));
  if (clinicianSeverity(m) === null && impactRated(m) && !impactMet(m))
    caveats.push(L(
      `Beeinträchtigung und Belastung unter ${IMPACT_CLINICAL} eingeschätzt — Schweregrad der Diagnose (klinisch/subklinisch) beurteilen.`,
      `Altération et détresse évaluées en dessous de ${IMPACT_CLINICAL} — évaluer la sévérité du diagnostic (clinique/subclinique).`,
      `Impairment and distress rated below ${IMPACT_CLINICAL} — judge the severity of the diagnosis (clinical/subclinical).`,
    ));
  return {
    moduleId: "panic",
    diagnosis: "panic_disorder",
    icdCode: "F41.0",
    label: L("Panikstörung", "Trouble panique", "Panic disorder"),
    disorderCategory: "anxiety",
    entered: hasPanic(m),
    met: met(criteria),
    criteria,
    caveats,
    suggestedText: suggested("Panikstörung", "F41.0"),
  };
}

function evalAgora(m: ModuleAnswers, panicMet: boolean): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "agora")!;
  const groups = clinicalGroups(m, "agora", "grid").length;
  const rows = clinicalRowsOf(m, "agora", "grid");
  const icdCode = panicMet ? "F40.01" : "F40.00";
  const current = m["1.1"] === "yes";
  const endured = rows.some((r) => (num(m[`grid_${r.key}_sev`]) ?? 0) >= SEV_CLINICAL);
  const avoided = rows.some((r) => m[`grid_${r.key}_avoid`] === "yes");
  const criteria: CriterionCheck[] = [
    currencyCriterion(current),
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
        "Deutliche Angst in ≥ 2 von 5 Situationsbereichen",
        "Peur marquée dans ≥ 2 des 5 domaines de situations",
        "Marked fear in ≥ 2 of 5 situation areas",
      ),
      met: groups >= 2,
      detail: rows.length ? `${groups} Bereiche: ${rowNames(m, "grid", rows)}` : undefined,
    },
    {
      key: "consistent",
      label: L(
        "Die Situationen lösen fast immer Angst aus",
        "Les situations provoquent presque toujours de la peur",
        "The situations almost always provoke fear",
      ),
      met: m["4"] === "yes",
    },
    {
      key: "avoidance",
      label: L(
        "Situationen werden vermieden, nur in Begleitung aufgesucht oder unter starker Angst ertragen",
        "Les situations sont évitées, affrontées seulement accompagné(e) ou subies avec une peur intense",
        "The situations are avoided, require a companion, or are endured with intense fear",
      ),
      met: avoided || endured || m["companion"] === "yes",
    },
    disproportionCriterion(m),
    durationCriterion(m["dur6"] === "yes"),
    impactCriterion(m),
    ...severityCriteria(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && mod.enter(m)) caveats.push(LIFETIME_CAVEAT);
  if (panicMet)
    caveats.push(L(
      "Kombination mit Panikstörung — ICD-10 kodiert F40.01 (Agoraphobie mit Panikstörung); nach DSM-5 werden beide Diagnosen getrennt vergeben.",
      "Combinaison avec un trouble panique — CIM-10 : F40.01 (agoraphobie avec trouble panique) ; le DSM-5 pose les deux diagnostics séparément.",
      "Combined with panic disorder — ICD-10 codes this as F40.01 (agoraphobia with panic disorder); DSM-5 gives both diagnoses separately.",
    ));
  return {
    moduleId: "agora",
    diagnosis: "agoraphobia",
    icdCode,
    label: L("Agoraphobie", "Agoraphobie", "Agoraphobia"),
    disorderCategory: "anxiety",
    entered: mod.enter(m),
    met: met(criteria),
    criteria,
    caveats,
    suggestedText: suggested(panicMet ? "Agoraphobie mit Panikstörung" : "Agoraphobie", icdCode),
  };
}

function evalSocial(m: ModuleAnswers): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "social")!;
  const rows = clinicalRowsOf(m, "social", "grid");
  const current = m["1.1"] === "yes";
  // Items 2.1/2.2; interviews predating them fall back to the checklist.
  const asked = m["2.1"] !== undefined || m["2.2"] !== undefined;
  const avoidOrEndure = asked
    ? m["2.1"] === "yes" || m["2.2"] === "yes"
    : rows.some((r) => m[`grid_${r.key}_avoid`] === "yes" || (num(m[`grid_${r.key}_sev`]) ?? 0) >= SEV_CLINICAL);
  const criteria: CriterionCheck[] = [
    currencyCriterion(current),
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
        "Deutliche Angst/Vermeidung in ≥ 1 sozialen oder Leistungssituation",
        "Peur/évitement marqués dans ≥ 1 situation sociale ou de performance",
        "Marked fear/avoidance in ≥ 1 social or performance situation",
      ),
      met: rows.length >= 1,
      detail: rows.length ? rowNames(m, "grid", rows) : undefined,
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
      key: "avoidance",
      label: L(
        "Die Situationen werden vermieden oder nur unter großer Angst ertragen",
        "Les situations sont évitées ou subies avec une grande peur",
        "The situations are avoided or endured only with great fear",
      ),
      met: avoidOrEndure,
    },
    disproportionCriterion(m),
    durationCriterion(m["4.2"] === "yes"),
    impactCriterion(m),
    ...severityCriteria(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && mod.enter(m)) caveats.push(LIFETIME_CAVEAT);
  if (m["7"] === "yes")
    caveats.push(L(
      "Vermeidung aus Angst vor einem unerwarteten Angstanfall — prüfen, ob die Symptome besser durch Agoraphobie/Panikstörung erklärt sind.",
      "Évitement par peur d'une crise d'angoisse inattendue — vérifier si les symptômes s'expliquent mieux par une agoraphobie/un trouble panique.",
      "Avoidance for fear of an unexpected anxiety attack — check whether agoraphobia/panic disorder explains the symptoms better.",
    ));
  if (m["11"] === "yes")
    caveats.push(L(
      "Angst, andere in Verlegenheit zu bringen — kulturellen Kontext abklären (z. B. Taijin kyofusho).",
      "Peur de mettre les autres dans l'embarras — clarifier le contexte culturel (p. ex. taijin kyofusho).",
      "Fear of embarrassing others — clarify the cultural context (e.g. taijin kyofusho).",
    ));
  if (rows.length && rows.every((r) => SOCIAL_PERFORMANCE_ROWS.includes(r.key)))
    caveats.push(L(
      "Angst nur in Auftritts-/Prüfungssituationen — Zusatzcodierung „nur in Leistungssituationen“ prüfen.",
      "Peur uniquement en situation de performance/d'examen — vérifier la spécification « seulement de performance ».",
      "Fear only in performance/exam situations — consider the \"performance only\" specifier.",
    ));
  return {
    moduleId: "social",
    diagnosis: "social_anxiety",
    icdCode: "F40.1",
    label: L("Soziale Angststörung (Soziale Phobie)", "Trouble d'anxiété sociale", "Social anxiety disorder"),
    disorderCategory: "anxiety",
    entered: mod.enter(m),
    met: met(criteria),
    criteria,
    caveats,
    suggestedText: suggested("Soziale Angststörung", "F40.1"),
  };
}

/// DSM-5 specific-phobia types, in the order of the checklist groups.
const PHOBIA_SUBTYPES = ["Tier-Typus", "Umwelt-Typus", "Blut-Spritzen-Verletzungs-Typus", "situativer Typus", "anderer Typus"];

function evalPhobia(m: ModuleAnswers): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "phobia")!;
  const rows = clinicalRowsOf(m, "phobia", "grid");
  const subtypes = clinicalGroups(m, "phobia", "grid").map((i) => PHOBIA_SUBTYPES[i]);
  const current = m["1.1"] === "yes";
  const criteria: CriterionCheck[] = [
    currencyCriterion(current),
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
        "Deutliche Angst/Vermeidung bei ≥ 1 Objekt oder Situation",
        "Peur/évitement marqués pour ≥ 1 objet ou situation",
        "Marked fear/avoidance for ≥ 1 object or situation",
      ),
      met: rows.length >= 1,
      detail: rows.length ? `${rowNames(m, "grid", rows)} (${subtypes.join(", ")})` : undefined,
    },
    {
      // Items 4.1 (id "3") and 4.2 both inform this criterion. [clinician-confirm]
      key: "immediate",
      label: L(
        "Die Angst tritt fast immer sofort auf bzw. nimmt bei Annäherung zu",
        "La peur survient presque toujours immédiatement ou augmente à l'approche",
        "The fear arises almost always immediately, or increases on approach",
      ),
      met: m["3"] === "yes" || m["4.2"] === "yes",
    },
    disproportionCriterion(m),
    durationCriterion(m["dur6"] === "yes"),
    impactCriterion(m),
    ...severityCriteria(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && mod.enter(m)) caveats.push(LIFETIME_CAVEAT);
  if (m["4.3"] === "yes")
    caveats.push(L(
      "Vermeidung aus Furcht vor einem Angstanfall (ggf. mit unerwarteten Anfällen außerhalb der Situation) — erwägen, ob die Angst unter Panikstörung/Agoraphobie zu subsumieren ist.",
      "Évitement par crainte d'une crise d'angoisse (éventuellement avec des crises inattendues hors situation) — envisager de rattacher la peur à un trouble panique/une agoraphobie.",
      "Avoidance for fear of an anxiety attack (possibly with unexpected attacks outside the situation) — consider subsuming the fear under panic disorder/agoraphobia.",
    ));
  const name = subtypes.length === 1 ? `Spezifische Phobie, ${subtypes[0]}` : "Spezifische Phobie";
  return {
    moduleId: "phobia",
    diagnosis: "specific_phobia",
    icdCode: "F40.2",
    label: L("Spezifische Phobie", "Phobie spécifique", "Specific phobia"),
    disorderCategory: "anxiety",
    entered: mod.enter(m),
    met: met(criteria),
    criteria,
    caveats,
    suggestedText: suggested(name, "F40.2"),
  };
}

const worryDomains = (m: ModuleAnswers) =>
  (gridItem("gad", "worries")?.groups ?? []).flatMap((g) => g.rows).filter((r) => m[`worries_${r.key}_primary`] === "yes");

function evalGad(m: ModuleAnswers, ctx?: EvalContext): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "gad")!;
  // DSM-5: adults need >= 3 of the 6 accompanying symptoms, children only 1
  // (the DIPS Open Access, an adult interview, states 3).
  const required = isChild(ctx) ? 1 : 3;
  const current = gadCurrent(m);
  const domains = worryDomains(m);
  const criteria: CriterionCheck[] = [
    currencyCriterion(current),
    {
      key: "screen",
      label: L(
        "Übermäßige Sorgen an der Mehrzahl der Tage über ≥ 6 Monate",
        "Inquiétudes excessives la plupart des jours pendant ≥ 6 mois",
        "Excessive worry on most days for ≥ 6 months",
      ),
      // Item 1.1 covers the six months for the current phase, 4.2 for a past one.
      met: current || (gadPast(m) && m["4.2"] === "yes"),
      detail: m["5"] !== undefined && String(m["5"]).trim() !== "" ? `${m["5"]} % des Tages angespannt/besorgt` : undefined,
    },
    {
      key: "domains",
      label: L(
        "Sorgen in ≥ 2 Lebensbereichen",
        "Inquiétudes dans ≥ 2 domaines de vie",
        "Worry in ≥ 2 life domains",
      ),
      met: domains.length >= 2,
      detail: domains.length ? rowNames(m, "worries", domains) : undefined,
    },
    {
      key: "uncontrollable",
      label: L(
        "Die Sorgen sind schwer zu kontrollieren",
        "Les inquiétudes sont difficiles à contrôler",
        "The worries are difficult to control",
      ),
      met: current ? m["1.3"] === "yes" : m["1.6"] === "yes",
    },
    {
      key: "symptoms",
      label: L(
        `≥ ${required} Begleitsymptom(e), mindestens einige an der Mehrzahl der Tage${required === 1 ? " — Kinderkriterium" : ""}`,
        `≥ ${required} symptôme(s) associé(s), au moins certains la plupart des jours${required === 1 ? " — critère enfant" : ""}`,
        `≥ ${required} accompanying symptom(s), at least some on the majority of days${required === 1 ? " — child criterion" : ""}`,
      ),
      met: mod.enter(m) && gadSymCount(m) >= required && gadSomeMajority(m),
      detail: `${gadSymCount(m)} von 6 Symptomen bejaht${gadSymCount(m) > 0 && !gadSomeMajority(m) ? ", keines an der Mehrzahl der Tage" : ""}`,
    },
    impactCriterion(m),
    ...severityCriteria(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && mod.enter(m)) caveats.push(LIFETIME_CAVEAT);
  if (met(criteria))
    caveats.push(L(
      "Nicht zu vergeben, wenn die Sorgen ausschließlich im Rahmen depressiver Phasen auftreten oder einer anderen Angststörung zuzuordnen sind — depressive Störung abklären (nicht Teil dieses Interviews).",
      "À ne pas poser si les inquiétudes surviennent exclusivement lors d'épisodes dépressifs ou relèvent d'un autre trouble anxieux — écarter un trouble dépressif (hors de cet entretien).",
      "Not to be given if the worries occur exclusively during depressive phases or belong to another anxiety disorder — rule out a depressive disorder (not part of this interview).",
    ));
  return {
    moduleId: "gad",
    diagnosis: "gad",
    icdCode: "F41.1",
    label: L("Generalisierte Angststörung", "Trouble d'anxiété généralisée", "Generalised anxiety disorder"),
    disorderCategory: "anxiety",
    entered: mod.enter(m),
    met: met(criteria),
    criteria,
    caveats,
    suggestedText: suggested("Generalisierte Angststörung", "F41.1"),
  };
}

function evalSep(m: ModuleAnswers, ctx?: EvalContext): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "sep")!;
  const current = m["1.1"] === "yes";
  // The DIPS asks for six months. DSM-5 accepts four weeks in children and
  // adolescents — item id "4.1", a clinic addition to the adult interview.
  const child = isChild(ctx);
  const durationMet = child ? m["4.1"] === "yes" || m["4.2"] === "yes" : m["4.2"] === "yes";
  const criteria: CriterionCheck[] = [
    currencyCriterion(current),
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
      met: mod.enter(m) && sepSymCount(m) >= 3,
      detail: `${sepSymCount(m)} von 8 Symptomen bejaht`,
    },
    disproportionCriterion(m),
    durationCriterion(durationMet, child),
    impactCriterion(m),
    ...severityCriteria(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && mod.enter(m)) caveats.push(LIFETIME_CAVEAT);
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
    disorderCategory: "anxiety",
    entered: mod.enter(m),
    met: met(criteria),
    criteria,
    caveats,
    suggestedText: suggested("Störung mit Trennungsangst", "F93.0"),
  };
}

// ---- public API ----------------------------------------------------------------

/// Evaluate every DIPS module (also the ones that did not screen positive) —
/// the DiagnosisView shows the full breakdown including near-misses.
/// `ctx.age` activates the child criteria (GAD symptom count, separation-
/// anxiety duration); omitted/unknown age evaluates with adult thresholds.
export function evaluateDips(raw: DipsAnswers, ctx?: EvalContext): ModuleEvaluation[] {
  // Only what the skip logic leaves standing is evaluated (see effectiveModule).
  const answers = effectiveAnswers(raw);
  const m = (id: string): ModuleAnswers => answers[id] ?? {};
  const panic = evalPanic(m("panic"));
  const agora = evalAgora(m("agora"), panic.met);
  const social = evalSocial(m("social"));
  const phobia = evalPhobia(m("phobia"));
  const gad = evalGad(m("gad"), ctx);
  const sep = evalSep(m("sep"), ctx);

  // ICD-10 excludes a standalone F41.0 when F40.01 (agoraphobia WITH panic
  // disorder) is coded — the panic evaluation stays visible (criteria met) but
  // is marked suppressed and never proposed separately. (DSM-5 would code
  // both; this engine emits ICD-10 codes, so the ICD-10 rule wins.)
  if (panic.met && agora.met) {
    panic.suppressed = true;
    panic.caveats.push(L(
      "Kriterien erfüllt, aber in F40.01 (Agoraphobie mit Panikstörung) enthalten — ICD-10 kodiert F41.0 nicht zusätzlich.",
      "Critères remplis, mais inclus dans F40.01 (agoraphobie avec trouble panique) — la CIM-10 ne code pas F41.0 en plus.",
      "Criteria met, but subsumed under F40.01 (agoraphobia with panic disorder) — ICD-10 does not code F41.0 in addition.",
    ));
  }
  // Differential-diagnostic notes the interview attaches across sections.
  if (m("panic")["10"] === "yes" && !agora.met)
    panic.caveats.push(L(
      "Situationsvermeidung berichtet — im Verlauf abklären, ob sie für eine andere Störung (z. B. Agoraphobie) typisch ist.",
      "Évitement de situations rapporté — clarifier s'il est typique d'un autre trouble (p. ex. agoraphobie).",
      "Avoidance of situations reported — clarify whether it is typical of another disorder (e.g. agoraphobia).",
    ));
  if (agora.met && phobia.met)
    phobia.caveats.push(L(
      "Werden die Situationen im Kontext der Agoraphobie gefürchtet (z. B. enge Räume), wird keine zusätzliche Spezifische Phobie vergeben.",
      "Si les situations sont redoutées dans le cadre de l'agoraphobie (p. ex. espaces clos), aucune phobie spécifique supplémentaire n'est posée.",
      "If the situations are feared in the context of agoraphobia (e.g. enclosed spaces), no additional specific phobia is given.",
    ));
  if (sep.met && ["outside", "otheroutside"].some((k) => m("agora")[`grid_${k}_primary`] === "yes"))
    agora.caveats.push(L(
      "„Draußen alleine sein“ bejaht bei gleichzeitiger Trennungsangst — die Schwierigkeiten dürfen nicht mit der Störung mit Trennungsangst zusammenhängen.",
      "« Être seul(e) dehors » coché avec une anxiété de séparation concomitante — les difficultés ne doivent pas être liées au trouble d'anxiété de séparation.",
      "\"Being outside alone\" endorsed alongside separation anxiety — the difficulties must not be related to the separation anxiety disorder.",
    ));
  return [panic, agora, social, phobia, gad, sep];
}

/// Only the modules whose full rule is met and whose code is not subsumed by
/// another met diagnosis — the diagnosis proposals.
export function deriveDiagnoses(answers: DipsAnswers, ctx?: EvalContext): ModuleEvaluation[] {
  return evaluateDips(answers, ctx).filter((e) => e.met && !e.suppressed);
}

/// The single proposal used to pre-fill the diagnosis field. DIPS convention:
/// the primary diagnosis is the one with the highest severity rating; records
/// without one rank by the impairment/distress ratings mapped to the same 0–8
/// range (ties: module order).
export function primaryProposal(answers: DipsAnswers, ctx?: EvalContext): ModuleEvaluation | null {
  const proposals = deriveDiagnoses(answers, ctx);
  if (!proposals.length) return null;
  const effective = effectiveAnswers(answers);
  return proposals.reduce((best, e) =>
    severityRank(effective[e.moduleId] ?? {}) > severityRank(effective[best.moduleId] ?? {}) ? e : best,
  );
}
