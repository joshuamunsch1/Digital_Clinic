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
  gadSymCount,
  hasPanic,
  pdShown,
  sepSymCount,
  symCount,
} from "./schema";

/// Clinical-significance cut on the 0–8 impairment/distress scales, and on the
/// clinician severity rating (DIPS convention: diagnosis from >= 4). [clinician-confirm]
export const IMPACT_CLINICAL = 4;

/// Patient context for age-banded DSM-5 criteria (child GAD symptom count,
/// child separation-anxiety duration). Absent/unknown age applies the adult
/// thresholds — the stricter reading, never the looser one.
export interface EvalContext {
  age?: number | null;
}
const isChild = (ctx?: EvalContext) => ctx?.age != null && Number.isFinite(ctx.age) && ctx.age < 18;
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

/// DIPS clinician severity rating (0–8), when the interviewer recorded one.
const clinicianSeverity = (m: ModuleAnswers): number | null => num(m["clinsev_sev"]);

/// Clinical significance: the clinician's severity rating (>= 4) when present
/// — the DIPS convention — with the patient-rated impairment/distress dual
/// scale as fallback for records without one.
const impactMet = (m: ModuleAnswers) => {
  const sev = clinicianSeverity(m);
  if (sev !== null) return sev >= IMPACT_CLINICAL;
  return (num(m["impact_impair"]) ?? 0) >= IMPACT_CLINICAL || (num(m["impact_distress"]) ?? 0) >= IMPACT_CLINICAL;
};

const impactDetail = (m: ModuleAnswers) => {
  const sev = clinicianSeverity(m);
  const patient = `Beeinträchtigung ${num(m["impact_impair"]) ?? "—"} / Belastung ${num(m["impact_distress"]) ?? "—"} (0–8)`;
  return sev !== null ? `Schweregrad-Rating ${sev} (0–8, Therapeut*in) · ${patient}` : patient;
};

const impactSum = (m: ModuleAnswers) => (num(m["impact_impair"]) ?? 0) + (num(m["impact_distress"]) ?? 0);

/// Ranking value for the principal-diagnosis pick: the clinician severity
/// rating when present (DIPS: Hauptdiagnose = highest severity), else the
/// patient impact sum mapped onto the same 0–8 range.
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
  return it.groups.filter((g) => !g.nonCore && g.rows.some((r) => clinicalRow(m, gridId, r.key))).length;
}

const rowNames = (rows: GridRow[]) => rows.map((r) => tr(r.label, "de")).join(", ");

// ---- shared criterion/caveat builders -----------------------------------------

const impactCriterion = (m: ModuleAnswers): CriterionCheck => ({
  key: "impact",
  label: L(
    `Klinische Bedeutsamkeit (Schweregrad-Rating ≥ ${IMPACT_CLINICAL} von 8; ersatzweise Beeinträchtigung/Belastung ≥ ${IMPACT_CLINICAL})`,
    `Signification clinique (sévérité ≥ ${IMPACT_CLINICAL} sur 8 ; à défaut altération/détresse ≥ ${IMPACT_CLINICAL})`,
    `Clinical significance (severity rating ≥ ${IMPACT_CLINICAL} of 8; fallback impairment/distress ≥ ${IMPACT_CLINICAL})`,
  ),
  met: impactMet(m),
  detail: impactDetail(m),
});

/// DIPS codes every diagnosis "aktuell" vs. "früher". The engine only ever
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

const LIFETIME_CAVEAT = L(
  "Nur frühere Episode(n) berichtet — kein aktueller Diagnosevorschlag; ggf. als remittierte/frühere Diagnose dokumentieren.",
  "Seuls des épisodes antérieurs sont rapportés — pas de proposition de diagnostic actuel ; documenter le cas échéant comme diagnostic antérieur/rémis.",
  "Only past episode(s) reported — no current diagnosis proposal; document as a past/remitted diagnosis if appropriate.",
);

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
  const current = m["1.1"] === "yes";
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
    impactCriterion(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && m["1.2"] === "yes") caveats.push(LIFETIME_CAVEAT);
  // Item 6 (attacks per month) is optional in the interview, so it is a caveat
  // rather than a hard criterion — but an explicit 0 contradicts "recurrent".
  const freq = num(m["6"]) ?? (typeof m["6"] === "string" && m["6"].trim() !== "" ? Number(m["6"]) : null);
  if (freq !== null && Number.isFinite(freq) && freq <= 0)
    caveats.push(L(
      "Anfallsfrequenz 0/Monat angegeben — DSM-Kriterium „wiederkehrende Panikattacken“ prüfen.",
      "Fréquence d'attaques indiquée : 0/mois — vérifier le critère DSM « attaques de panique récurrentes ».",
      "Attack frequency of 0/month reported — check the DSM criterion of recurrent panic attacks.",
    ));
  return {
    moduleId: "panic",
    diagnosis: "panic_disorder",
    icdCode: "F41.0",
    label: L("Panikstörung", "Trouble panique", "Panic disorder"),
    disorderCategory: "anxiety",
    entered: hasPanic(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats,
    suggestedText: suggested("Panikstörung", "F41.0"),
  };
}

function evalAgora(m: ModuleAnswers, panicMet: boolean): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "agora")!;
  const groups = clinicalGroupCount(m, "agora", "grid");
  const rows = clinicalRowsOf(m, "agora", "grid");
  const icdCode = panicMet ? "F40.01" : "F40.00";
  const current = m["1.1"] === "yes";
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
        `Deutliche Angst in ≥ 2 von 5 Situationskategorien (Stärke ≥ ${SEV_CLINICAL} oder Vermeidung)`,
        `Peur marquée dans ≥ 2 des 5 catégories de situations (intensité ≥ ${SEV_CLINICAL} ou évitement)`,
        `Marked fear in ≥ 2 of 5 situation categories (severity ≥ ${SEV_CLINICAL} or avoidance)`,
      ),
      met: groups >= 2,
      detail: rows.length ? `${groups} Kategorien: ${rowNames(rows)}` : undefined,
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
      key: "duration",
      label: L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
      met: m["dur6"] === "yes",
    },
    impactCriterion(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && m["1.4"] === "yes") caveats.push(LIFETIME_CAVEAT);
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
    disorderCategory: "anxiety",
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
  const current = m["1.1"] === "yes";
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
  const caveats = exclusionCaveats(m);
  if (!current && m["1.4"] === "yes") caveats.push(LIFETIME_CAVEAT);
  return {
    moduleId: "social",
    diagnosis: "social_anxiety",
    icdCode: "F40.1",
    label: L("Soziale Angststörung (Soziale Phobie)", "Trouble d'anxiété sociale", "Social anxiety disorder"),
    disorderCategory: "anxiety",
    entered: mod.enter(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats,
    suggestedText: suggested("Soziale Angststörung", "F40.1"),
  };
}

function evalPhobia(m: ModuleAnswers): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "phobia")!;
  const rows = clinicalRowsOf(m, "phobia", "grid");
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
        `Deutliche Angst/Vermeidung bei ≥ 1 Stimulus (Stärke ≥ ${SEV_CLINICAL} oder Vermeidung)`,
        `Peur/évitement marqués pour ≥ 1 stimulus (intensité ≥ ${SEV_CLINICAL} ou évitement)`,
        `Marked fear/avoidance for ≥ 1 stimulus (severity ≥ ${SEV_CLINICAL} or avoidance)`,
      ),
      met: rows.length >= 1,
      detail: rows.length ? rowNames(rows) : undefined,
    },
    {
      key: "immediate",
      label: L(
        "Die Angst tritt fast immer sofort bei Konfrontation auf",
        "La peur survient presque toujours immédiatement lors de la confrontation",
        "The fear arises almost always immediately on confrontation",
      ),
      met: m["3"] === "yes",
    },
    {
      key: "duration",
      label: L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
      met: m["dur6"] === "yes",
    },
    impactCriterion(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && m["1.2"] === "yes") caveats.push(LIFETIME_CAVEAT);
  return {
    moduleId: "phobia",
    diagnosis: "specific_phobia",
    icdCode: "F40.2",
    label: L("Spezifische Phobie", "Phobie spécifique", "Specific phobia"),
    disorderCategory: "anxiety",
    entered: mod.enter(m),
    met: criteria.every((c) => c.met),
    criteria,
    caveats,
    suggestedText: suggested("Spezifische Phobie", "F40.2"),
  };
}

function evalGad(m: ModuleAnswers, ctx?: EvalContext): ModuleEvaluation {
  // DSM-5: adults need >= 3 of the 6 accompanying symptoms, children only 1.
  const required = isChild(ctx) ? 1 : 3;
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
        `≥ ${required} Begleitsymptom(e) an der Mehrzahl der Tage (Ruhelosigkeit, Ermüdbarkeit, Konzentration, Reizbarkeit, Anspannung, Schlaf)${required === 1 ? " — Kinderkriterium" : ""}`,
        `≥ ${required} symptôme(s) associé(s) la plupart des jours (agitation, fatigabilité, concentration, irritabilité, tension, sommeil)${required === 1 ? " — critère enfant" : ""}`,
        `≥ ${required} accompanying symptom(s) on the majority of days (restlessness, fatigue, concentration, irritability, tension, sleep)${required === 1 ? " — child criterion" : ""}`,
      ),
      met: m["1.1"] === "yes" && gadSymCount(m) >= required,
      detail: `${gadSymCount(m)} von 6 Symptomen bejaht (explizit verneinte „Mehrzahl der Tage“ ausgeschlossen)`,
    },
    impactCriterion(m),
  ];
  return {
    moduleId: "gad",
    diagnosis: "gad",
    icdCode: "F41.1",
    label: L("Generalisierte Angststörung", "Trouble d'anxiété généralisée", "Generalised anxiety disorder"),
    disorderCategory: "anxiety",
    entered: m["1.1"] === "yes",
    met: criteria.every((c) => c.met),
    criteria,
    caveats: exclusionCaveats(m),
    suggestedText: suggested("Generalisierte Angststörung", "F41.1"),
  };
}

function evalSep(m: ModuleAnswers, ctx?: EvalContext): ModuleEvaluation {
  const mod = MODULES.find((x) => x.id === "sep")!;
  const current = m["1.1"] === "yes";
  // DSM-5 duration: >= 4 weeks in children/adolescents, typically >= 6 months
  // in adults. Records predating item 4.1 fall back to the 6-month answer.
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
    {
      key: "duration",
      label: child
        ? L("Dauer mindestens 4 Wochen (Kinder/Jugendliche)", "Durée d'au moins 4 semaines (enfants/adolescents)", "Duration of at least 4 weeks (children/adolescents)")
        : L("Dauer mindestens 6 Monate", "Durée d'au moins 6 mois", "Duration of at least 6 months"),
      met: durationMet,
    },
    impactCriterion(m),
  ];
  const caveats = exclusionCaveats(m);
  if (!current && m["1.3"] === "yes") caveats.push(LIFETIME_CAVEAT);
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
    met: criteria.every((c) => c.met),
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
export function evaluateDips(answers: DipsAnswers, ctx?: EvalContext): ModuleEvaluation[] {
  const m = (id: string): ModuleAnswers => answers[id] ?? {};
  const panic = evalPanic(m("panic"));
  const agora = evalAgora(m("agora"), panic.met);
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
  return [
    panic,
    agora,
    evalSocial(m("social")),
    evalPhobia(m("phobia")),
    evalGad(m("gad"), ctx),
    evalSep(m("sep"), ctx),
  ];
}

/// Only the modules whose full rule is met and whose code is not subsumed by
/// another met diagnosis — the diagnosis proposals.
export function deriveDiagnoses(answers: DipsAnswers, ctx?: EvalContext): ModuleEvaluation[] {
  return evaluateDips(answers, ctx).filter((e) => e.met && !e.suppressed);
}

/// The single proposal used to pre-fill the diagnosis field. DIPS convention:
/// the principal diagnosis is the one with the highest clinician severity
/// rating; records without one rank by the patient impact sum mapped to the
/// same 0–8 range (ties: module order).
export function primaryProposal(answers: DipsAnswers, ctx?: EvalContext): ModuleEvaluation | null {
  const met = deriveDiagnoses(answers, ctx);
  if (!met.length) return null;
  return met.reduce((best, e) =>
    severityRank(answers[e.moduleId] ?? {}) > severityRank(answers[best.moduleId] ?? {}) ? e : best,
  );
}
