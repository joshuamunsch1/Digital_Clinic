// Fictional demo data used to seed the database (and reset it).
// Demo credentials: staff passwords are role-based (director2026 / admin2026 /
// therapist2026), every demo patient uses patient2026 — see README.
import { clamp } from "./format";
import { PALETTE } from "./theme";
import type {
  CaseCharacteristics,
  Demographics,
  DipsAnswers,
  ModuleAnswers,
  SessionLogType,
  TerminationReason,
} from "./types";
import type { RawAnswers } from "./instruments/types";

// Staff titles are stored data (not UI strings) — German, like the real clinic.
export const THERAPISTS = [
  { id: "t1", name: "Dr. Anna Keller", title: "Klinische Psychologin", role: "therapist" as const, email: "anna.keller@linden-clinic.ch" },
  { id: "t2", name: "Dr. Lukas Brunner", title: "Psychotherapeut", role: "therapist" as const, email: "lukas.brunner@linden-clinic.ch" },
  { id: "t3", name: "Dr. Sofia Ricci", title: "Klinische Psychologin", role: "therapist" as const, email: "sofia.ricci@linden-clinic.ch" },
];
export const DIRECTOR = { id: "d1", name: "Dr. Margrit Steiner", title: "Klinikleitung", role: "director" as const, email: "margrit.steiner@linden-clinic.ch" };
export const ADMIN = { id: "a1", name: "Kurt Iseli", title: "Praxisadministration", role: "admin" as const, email: "kurt.iseli@linden-clinic.ch" };

export const DEMO_PASSWORDS = {
  director: "director2026",
  admin: "admin2026",
  therapist: "therapist2026",
  patient: "patient2026",
} as const;

// --- PSTB session series (Berner Patientenstundenbogen, items -3..+3) ----------

const PSTB_REVERSED = new Set(["I8", "I12", "I14", "I19"]);

export interface DemoSession {
  session: number;
  date: string;
  answers: RawAnswers;
  note: string;
}

/// Deterministic per-session PSTB answers around a wellbeing level (0-10 →
/// scale mean −3..+3). Reverse-scored items are stored "unrecoded" (raw), the
/// scoring engine flips them, matching the legacy data layout. endIso is the
/// date of the LAST session (archived demo patients end in earlier years).
export function pstbSessionsFor(levels: number[], endIso = "2026-06-08"): DemoSession[] {
  const base = new Date(endIso).getTime();
  const n = levels.length;
  return levels.map((v, i) => {
    const target = v * 0.6 - 3; // 0→−3, 10→+3
    const answers: RawAnswers = {};
    for (let item = 1; item <= 22; item++) {
      const id = `I${item}`;
      const wobble = (((i * 3 + item * 5) % 5) - 2) * 0.5;
      const val = clamp(Math.round(target + wobble), -3, 3);
      answers[id] = PSTB_REVERSED.has(id) ? -val : val; // raw (unrecoded) storage
    }
    return {
      session: i, // 0 = pre-therapy baseline
      date: new Date(base - (n - 1 - i) * 7 * 864e5).toISOString(),
      answers,
      note: "",
    };
  });
}

// --- PHQ-4 session series (4 items, 0-3, symptom screener) ----------------------

/// Deterministic per-session PHQ-4 answers: symptom load falls as the wellbeing
/// level rises (level 0-10 → total ≈ 12..0), so the symptom trajectory mirrors
/// the PSTB process trajectory. Same dates/session numbers as the PSTB series.
export function phq4SessionsFor(levels: number[], endIso = "2026-06-08"): DemoSession[] {
  const base = new Date(endIso).getTime();
  const n = levels.length;
  return levels.map((v, i) => {
    const targetItem = (10 - v) * 0.3; // per-item 0..3, inverse of wellbeing level
    const answers: RawAnswers = {};
    for (let item = 1; item <= 4; item++) {
      const wobble = (((i * 7 + item * 3) % 3) - 1) * 0.4;
      answers[`PHQ${item}`] = clamp(Math.round(targetItem + wobble), 0, 3);
    }
    return {
      session: i, // 0 = pre-therapy baseline
      date: new Date(base - (n - 1 - i) * 7 * 864e5).toISOString(),
      answers,
      note: "",
    };
  });
}

// --- BDI-FS (7 items, 0-3) -------------------------------------------------------

/// Mara: a falling BDI-FS trajectory (suicide item 0 throughout after intake).
export const BDI_FS_SERIES: { daysAgo: number; answers: RawAnswers }[] = [
  { daysAgo: 84, answers: { BDI1_Traurigkeit: 2, BDI2_Pessimismus: 2, BDI3_Versagen: 2, BDI4_Freudeverlust: 2, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 2, BDI7_Suizid: 1 } }, // total 12 (severe)
  { daysAgo: 56, answers: { BDI1_Traurigkeit: 2, BDI2_Pessimismus: 1, BDI3_Versagen: 1, BDI4_Freudeverlust: 2, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 1, BDI7_Suizid: 0 } }, // total 8 (moderate)
  { daysAgo: 28, answers: { BDI1_Traurigkeit: 1, BDI2_Pessimismus: 1, BDI3_Versagen: 0, BDI4_Freudeverlust: 1, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 1, BDI7_Suizid: 0 } }, // total 5 (mild)
  { daysAgo: 2, answers: { BDI1_Traurigkeit: 1, BDI2_Pessimismus: 0, BDI3_Versagen: 0, BDI4_Freudeverlust: 1, BDI5_Selbstablehnung: 0, BDI6_Selbstkritik: 1, BDI7_Suizid: 0 } }, // total 3 (minimal)
];

/// Camille: worsening BDI-FS with the suicide item endorsed on the latest
/// measurement — drives the clinical safety-flag demo.
export const BDI_FS_ALERT_SERIES: { daysAgo: number; answers: RawAnswers }[] = [
  { daysAgo: 30, answers: { BDI1_Traurigkeit: 1, BDI2_Pessimismus: 1, BDI3_Versagen: 1, BDI4_Freudeverlust: 2, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 1, BDI7_Suizid: 1 } }, // total 8
  { daysAgo: 3, answers: { BDI1_Traurigkeit: 2, BDI2_Pessimismus: 2, BDI3_Versagen: 1, BDI4_Freudeverlust: 2, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 1, BDI7_Suizid: 2 } }, // total 11, item 7 = 2 -> alert
];

// --- EDE-Q8 (8 items, 0-6), wave-based -------------------------------------------

export const EDEQ8_SERIES: { wave: string; daysAgo: number; answers: RawAnswers }[] = [
  { wave: "pre", daysAgo: 120, answers: { EDEQ1: 5, EDEQ2: 4, EDEQ3: 4, EDEQ4: 5, EDEQ5: 5, EDEQ6: 4, EDEQ7: 5, EDEQ8: 6 } },
  { wave: "zm", daysAgo: 60, answers: { EDEQ1: 4, EDEQ2: 3, EDEQ3: 3, EDEQ4: 4, EDEQ5: 4, EDEQ6: 2, EDEQ7: 4, EDEQ8: 4 } },
  { wave: "post", daysAgo: 7, answers: { EDEQ1: 2, EDEQ2: 2, EDEQ3: 1, EDEQ4: 3, EDEQ5: 2, EDEQ6: 1, EDEQ7: 2, EDEQ8: 3 } },
];

// --- FGG (37 items, assumed 1-6) --------------------------------------------------

function fggAnswers(level: number, seed: number): RawAnswers {
  const a: RawAnswers = {};
  for (let i = 1; i <= 37; i++) {
    a[`GG${i}`] = clamp(Math.round(level + (((seed * i * 7) % 5) - 2) * 0.4), 1, 6);
  }
  return a;
}
export const FGG_SERIES: { daysAgo: number; answers: RawAnswers }[] = [
  { daysAgo: 70, answers: fggAnswers(4.2, 3) },
  { daysAgo: 10, answers: fggAnswers(3.1, 5) },
];

// --- DIKJ (29 items, 0-2) ---------------------------------------------------------

function dikjAnswers(level: number, seed: number): RawAnswers {
  const a: RawAnswers = {};
  for (let i = 1; i <= 29; i++) {
    a[`DIKJ${i}`] = clamp(Math.round(level + (((seed * i * 11) % 5) - 2) * 0.3), 0, 2);
  }
  return a;
}
export const DIKJ_SERIES: { daysAgo: number; answers: RawAnswers }[] = [
  { daysAgo: 80, answers: dikjAnswers(1.4, 2) },
  { daysAgo: 40, answers: dikjAnswers(1.0, 4) },
  { daysAgo: 6, answers: dikjAnswers(0.6, 7) },
];

// --- SDQ (self 11-17 + parent, 25 items, 0-2) -------------------------------------

function sdqAnswers(seed: number, level: number): RawAnswers {
  const a: RawAnswers = {};
  for (let i = 1; i <= 25; i++) {
    a[`SDQ${i}`] = clamp(Math.round(((seed * i * 7) % 5) / 4 + level), 0, 2);
  }
  return a;
}
export const SDQ_SERIES: { wave: string; daysAgo: number; role: string; answers: RawAnswers }[] = [
  { wave: "pre", daysAgo: 40, role: "self", answers: sdqAnswers(3, 1.2) },
  { wave: "pre", daysAgo: 40, role: "mother", answers: sdqAnswers(5, 1.5) },
  { wave: "zm", daysAgo: 5, role: "self", answers: sdqAnswers(4, 0.7) },
  { wave: "zm", daysAgo: 5, role: "mother", answers: sdqAnswers(6, 1.0) },
];

// --- Therapist-administered DIPS interviews ----------------------------------------
//
// Every demo patient carries a full interview record so the diagnosis view opens
// for all dossiers. Answers are assembled per module: a POSITIVE block satisfies
// the module's screening predicate AND the full mechanical rule in
// src/lib/dips/diagnosis.ts (met = true); a NEGATIVE block answers the screening
// questions "no" (interview conducted, module not entered).

export type DipsModuleId = "panic" | "agora" | "social" | "phobia" | "gad" | "sep";
const DIPS_MODULE_IDS: DipsModuleId[] = ["panic", "agora", "social", "phobia", "gad", "sep"];

/// Clinically coherent positive interview blocks. No demo patient needs a
/// positive separation-anxiety module, so "sep" has no fixture.
const DIPS_POSITIVE: Partial<Record<DipsModuleId, ModuleAnswers>> = {
  panic: {
    "1.1": "yes", "1.1_text": "Im Supermarkt und beim Autofahren", "1.2": "yes", "1.3_from": "11/2025", "1.3_to": "—",
    "2.1": "Oft ganz plötzlich, auch zu Hause", "2.2": "yes", "2.2_unexpected": true, "3": "yes", "4": "05/2026",
    symptoms_s1_primary: "yes", symptoms_s1_sev: 3, symptoms_s2_primary: "yes", symptoms_s2_sev: 2, symptoms_s3_primary: "yes", symptoms_s3_sev: 2,
    symptoms_s4_primary: "yes", symptoms_s4_sev: 3, symptoms_s5_primary: "no", symptoms_s6_primary: "yes", symptoms_s6_sev: 2, symptoms_s7_primary: "no",
    symptoms_s8_primary: "yes", symptoms_s8_sev: 2, symptoms_s9_primary: "no", symptoms_s10_primary: "yes", symptoms_s10_sev: 3, symptoms_s11_primary: "yes", symptoms_s11_sev: 3,
    symptoms_s12_primary: "no", symptoms_s13_primary: "yes", symptoms_s13_sev: 1, "6": "6",
    "7": "yes", "8.1": "no", "8.2": "yes", "8.3": "yes", "8.4": "no", "9": "yes", "9_text": "Vermeide volle Läden", "10": "yes", "10_text": "Supermärkte, Autobahn",
    cog: "Enge Räume, Herzklopfen nach Kaffee", cope: "Atmen, nach draußen gehen", subst1: "no", subst2: "no", organic: "no",
    onset_age: "28", hist1: "yes", hist1_text: "Stress bei der Arbeit", hist2: "yes", hist2_text: "Hohe Belastung im Beruf",
    impact_impair: 6, impact_distress: 7, earlier: "no",
  },
  // ≥ 2 of 5 situation categories at clinical level (transport, enclosed, crowds).
  agora: {
    "1.1": "yes", "1.1_text": "Einkaufszentren, Bus und Bahn, Menschenmengen",
    "1.2": "yes", "1.3": "yes", companion: "yes",
    grid_bus_primary: "yes", grid_bus_sev: 2, grid_bus_avoid: "yes",
    grid_train_primary: "yes", grid_train_sev: 2, grid_train_avoid: "no",
    grid_shops_primary: "yes", grid_shops_sev: 3, grid_shops_avoid: "yes",
    grid_crowd_primary: "yes", grid_crowd_sev: 2, grid_crowd_avoid: "yes",
    "4": "yes", safety: "yes", safety_text: "Notfalltropfen und Handy immer dabei",
    cog: "Angst, ohnmächtig zu werden und nicht rechtzeitig wegzukommen",
    cope: "Verlässt die Situation, wartet draußen",
    approp: "no", subst1: "no", subst2: "no", organic: "no",
    onset_age: "24", dur6: "yes", hist1: "no", hist2: "yes", hist2_text: "Umzug und Stellenwechsel",
    impact_impair: 5, impact_distress: 5, earlier: "no",
  },
  social: {
    "1.1": "yes", "1.1_text": "Referate in der Schule, Gespräche mit Unbekannten",
    "1.2": "yes", "1.3": "yes",
    grid_speak_primary: "yes", grid_speak_sev: 3, grid_speak_avoid: "yes",
    grid_examoral_primary: "yes", grid_examoral_sev: 3, grid_examoral_avoid: "yes",
    grid_talkstranger_primary: "yes", grid_talkstranger_sev: 2, grid_talkstranger_avoid: "no",
    grid_party_primary: "yes", grid_party_sev: 2, grid_party_avoid: "yes",
    "4.2": "yes", "6": "yes",
    cog: "Angst, sich zu blamieren; alle würden es merken",
    cope: "Meldet sich krank, vermeidet Referate",
    approp: "no", subst1: "no", subst2: "no", organic: "no",
    onset_age: "13", hist1: "yes", hist1_text: "Bloßstellung vor der Klasse",
    hist2: "no", impact_impair: 5, impact_distress: 6, earlier: "no",
  },
  phobia: {
    "1.1": "yes", "1.1_text": "Spinnen — schon beim Anblick von Bildern",
    grid_animal1_primary: "yes", grid_animal1_sev: 3, grid_animal1_avoid: "yes",
    "3": "yes",
    cog: "Die Spinne könnte plötzlich auf mich zukommen",
    cope: "Betritt Keller und Estrich nur nach Kontrolle durch andere",
    approp: "no", subst1: "no", subst2: "no", organic: "no",
    onset_age: "9", dur6: "yes", hist1: "no", hist2: "no",
    impact_impair: 4, impact_distress: 6, earlier: "no",
  },
  // Screening + uncontrollability + ≥ 3 of 6 accompanying symptoms.
  gad: {
    "1.1": "yes", "1.2": "Arbeit, Gesundheit der Eltern, Finanzen, Alltagskleinigkeiten", "1.3": "yes",
    worries_family_primary: "yes", worries_family_expr: 2, worries_family_unc: 2,
    worries_work_primary: "yes", worries_work_expr: 3, worries_work_unc: 3,
    worries_finance_primary: "yes", worries_finance_expr: 2, worries_finance_unc: 2,
    worries_minor_primary: "yes", worries_minor_expr: 2, worries_minor_unc: 3,
    symptoms_restless_primary: "yes", symptoms_restless_sev: 2, symptoms_restless_maj: "yes",
    symptoms_concentration_primary: "yes", symptoms_concentration_sev: 2, symptoms_concentration_maj: "yes",
    symptoms_tension_primary: "yes", symptoms_tension_sev: 3, symptoms_tension_maj: "yes",
    symptoms_sleep_primary: "yes", symptoms_sleep_sev: 2, symptoms_sleep_maj: "yes",
    cog: "Die Sorgen beginnen oft schon beim Aufwachen",
    cope: "Rückversicherung bei der Familie, Listen schreiben",
    subst1: "no", subst2: "no", organic: "no",
    onset_age: "19", hist1: "no", hist2: "yes", hist2_text: "Prüfungsphase im Studium",
    impact_impair: 5, impact_distress: 6, earlier: "yes", earlier_text: "2022, mehrere Monate",
  },
};

/// Screening answered "no" for every module entry question — the module was
/// asked but not entered (keys per src/lib/dips/schema.ts screening predicates).
const DIPS_NEGATIVE: Record<DipsModuleId, ModuleAnswers> = {
  panic: { "1.1": "no", "1.2": "no" },
  agora: { "1.1": "no", "1.4": "no" },
  social: { "1.1": "no", "1.4": "no" },
  phobia: { "1.1": "no", "1.2": "no" },
  gad: { "1.1": "no" },
  sep: { "1.1": "no", "1.3": "no" },
};

/// Assemble a complete interview: positive blocks for the named modules,
/// negative screens everywhere else.
export function buildDipsAnswers(positive: DipsModuleId[]): DipsAnswers {
  const out: DipsAnswers = {};
  for (const id of DIPS_MODULE_IDS) {
    out[id] = positive.includes(id) && DIPS_POSITIVE[id] ? DIPS_POSITIVE[id]! : DIPS_NEGATIVE[id];
  }
  return out;
}

/// Back-compat fixture (referenced by tests): Mara's panic-positive interview.
export const SAMPLE_ANSWERS: DipsAnswers = { panic: DIPS_POSITIVE.panic! };

export interface DemoPatient {
  id: string;
  name: string;
  email: string;
  color: string;
  therapistId: string | null;
  status: "assessment" | "interview" | "therapy" | "archived";
  demographics: Demographics;
  levels: number[];
  diagnosis: string | null;
  disorderCategory: string | null;
  /// ICD-10 code next to the coarse category (docs/outcome-prediction.md §4.7).
  icd?: string;
  /// Coded intake predictors (§4.3) — the classic ETR set.
  caseCharacteristics?: CaseCharacteristics;
  /// Session-ledger entries (§4.5): held sessions (optionally numbered),
  /// cancellations, no-shows. A fixed id lets seedInvitations link a
  /// questionnaire request to the entry (sessionLogId FK).
  sessionLogs?: { id?: string; daysAgo: number; type: SessionLogType; sessionNumber?: number; note?: string }[];
  /// GAS therapy goals (Zielerreichungsskala). Ratings take daysAgo for active
  /// patients or an absolute `at` ISO date for archived ones (whose treatment
  /// episode lies in an earlier year than the demo window).
  goals?: {
    title: string;
    levels: Record<string, string>;
    ratings?: { daysAgo?: number; at?: string; level: number }[];
  }[];
  /// Concluded treatments (populate the archive view + filesystem export).
  /// reason is the coded termination label — therapist judgment (§6.2).
  archived?: { at: string; reason: TerminationReason };
  /// Date of the last PSTB/PHQ-4 session (defaults to the 2026 demo window).
  seriesEnd?: string;
  /// Diagnosis date override (defaults to the 2026 demo constant).
  diagnosedOn?: string;
  /// Therapist-conducted DIPS interview: which modules screen positive (empty =
  /// all screens negative) and when the interview was held. Every demo patient
  /// has one so the diagnosis view opens on all dossiers.
  dips: { positive: DipsModuleId[]; completedAt: string };
  hasBdiSeries?: boolean;
  hasBdiAlertSeries?: boolean;
  hasEdeq8Series?: boolean;
  hasFggSeries?: boolean;
  hasDikjSeries?: boolean;
  hasSdqSeries?: boolean;
}

// Free-text demo content (occupations, siblings, diagnoses) is German — the
// clinic's working language. sex/living keep the canonical English tokens the
// registration forms store; the UI translates those on display (trDemoValue).
export const DEMO_PATIENTS: DemoPatient[] = [
  { id: "p1", name: "Mara Vogel", email: "mara.vogel@example.org", color: PALETTE[0], therapistId: "t1", status: "therapy", demographics: { age: 29, sex: "Female", nationality: "Schweiz", city: "Bern", occupation: "Primarlehrerin", living: "With partner", siblings: "1 — älterer Bruder" }, levels: [3, 3.5, 4, 4.5, 5, 5.5, 6.5, 7, 7.5], diagnosis: "Panikstörung (DSM-5) — Platzhalter", disorderCategory: "anxiety", icd: "F41.0", caseCharacteristics: { problemDuration: "m6to24", priorPsychotherapy: false, psychotropicMedication: false, employment: "employed", treatmentExpectation: 8 }, sessionLogs: [{ daysAgo: 24, type: "held", note: "Kriseninterventionstermin, kein Fragebogen" }, { daysAgo: 10, type: "no_show", note: "Unentschuldigt" }, { id: "sl-p1-s9", daysAgo: 3, type: "held", sessionNumber: 9 }], dips: { positive: ["panic"], completedAt: "2026-03-09T10:00:00.000Z" }, hasBdiSeries: true,
    goals: [
      {
        title: "Alltagswege ohne Vermeidung bewältigen",
        levels: {
          "3": "Keine Vermeidung mehr im Alltag; spontane Wege ohne Sicherheitsverhalten",
          "2": "Nutzt den Bus regelmässig allein; Wochenendeinkauf im Einkaufszentrum",
          "1": "Fährt 1–2× pro Woche eine kurze Strecke mit dem Bus (Begleitung erlaubt)",
          "0": "Meidet Busfahrten und grössere Menschenmengen; Einkäufe übernimmt meist der Partner",
          "-1": "Verlässt das Haus seltener als heute",
        },
        ratings: [
          { daysAgo: 56, level: 0 }, { daysAgo: 42, level: 0 }, { daysAgo: 28, level: 1 },
          { daysAgo: 14, level: 1 }, { daysAgo: 3, level: 2 },
        ],
      },
      {
        title: "Umgang mit Panikattacken verbessern",
        levels: {
          "3": "Keine Attacken, oder Attacken ohne Bedeutung für die Tagesplanung",
          "2": "Höchstens eine Attacke pro Woche; kaum Erwartungsangst",
          "1": "Attacken treten auf, werden aber mit Atemtechnik durchgestanden",
          "0": "3–4 Attacken pro Woche; starke Angst vor der Angst",
          "-1": "Häufigere oder intensivere Attacken als heute",
        },
        ratings: [
          { daysAgo: 56, level: 0 }, { daysAgo: 35, level: 1 }, { daysAgo: 14, level: 1 }, { daysAgo: 3, level: 2 },
        ],
      },
    ] },
  { id: "p2", name: "David Hofmann", email: "david.hofmann@example.org", color: PALETTE[1], therapistId: "t2", status: "therapy", demographics: { age: 41, sex: "Male", nationality: "Schweiz", city: "Thun", occupation: "Logistikleiter", living: "With family", siblings: "2 — mittleres Kind" }, levels: [5, 4.5, 3.5, 3, 4, 5, 6], diagnosis: "Anpassungsstörung mit Angst (Platzhalter)", disorderCategory: "anxiety", icd: "F43.2", caseCharacteristics: { problemDuration: "lt6m", priorPsychotherapy: false, psychotropicMedication: false, employment: "employed", treatmentExpectation: 6 }, dips: { positive: [], completedAt: "2026-03-09T09:00:00.000Z" } },
  { id: "p3", name: "Elif Demir", email: "elif.demir@example.org", color: PALETTE[2], therapistId: "t1", status: "therapy", demographics: { age: 24, sex: "Female", nationality: "Türkei", city: "Biel/Bienne", occupation: "Pflegestudentin", living: "Shared flat", siblings: "3 — jüngste" }, levels: [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5], diagnosis: "Generalisierte Angststörung (Platzhalter)", disorderCategory: "anxiety", icd: "F41.1", caseCharacteristics: { problemDuration: "gt24m", priorPsychotherapy: true, psychotropicMedication: false, employment: "in_training", treatmentExpectation: 7 }, sessionLogs: [{ id: "sl-p3-s10", daysAgo: 38, type: "held", sessionNumber: 10 }], dips: { positive: ["gad"], completedAt: "2026-03-09T11:00:00.000Z" },
    goals: [
      {
        title: "Grübeln zeitlich begrenzen",
        levels: {
          "3": "Sorgen werden als Gedanken erkannt und ziehen gelassen; erholsamer Schlaf",
          "2": "Grübeln unterbricht den Alltag kaum noch; Einschlafen meist unter 30 Minuten",
          "1": "Grübelzeit täglich auf eine festgelegte halbe Stunde begrenzt",
          "0": "Mehrstündiges Grübeln, v. a. abends; Einschlafen dauert über eine Stunde",
          "-1": "Grübeln nimmt zu und betrifft zusätzliche Lebensbereiche",
        },
        // Deliberate dip into −1 so the trajectory demo shows the negative zone.
        ratings: [
          { daysAgo: 49, level: 0 }, { daysAgo: 35, level: 1 }, { daysAgo: 21, level: 0 },
          { daysAgo: 10, level: -1 }, { daysAgo: 2, level: 0 },
        ],
      },
      {
        title: "Entspannungsverfahren regelmässig anwenden",
        levels: {
          "3": "Setzt Entspannung gezielt in Belastungssituationen ein",
          "2": "Tägliche kurze Übung, auch ohne Anleitung",
          "1": "Übt 2–3× pro Woche progressive Muskelentspannung nach Anleitung",
          "0": "Kennt keine Entspannungstechnik; ständige Anspannung",
          "-1": "Keine Übungspraxis; Anspannung höher als zu Beginn",
        },
        ratings: [{ daysAgo: 49, level: 0 }, { daysAgo: 28, level: 1 }, { daysAgo: 7, level: 2 }],
      },
    ] },
  { id: "p4", name: "Jonas Wyss", email: "jonas.wyss@example.org", color: PALETTE[3], therapistId: "t3", status: "therapy", demographics: { age: 35, sex: "Male", nationality: "Schweiz", city: "Fribourg", occupation: "Software-Entwickler", living: "Alone", siblings: "Keine" }, levels: [4, 5, 4, 5.5, 4.5], diagnosis: "Burnout / Erschöpfungssyndrom (Platzhalter)", disorderCategory: "burnout", icd: "Z73.0", caseCharacteristics: { problemDuration: "m6to24", priorPsychotherapy: false, psychotropicMedication: false, employment: "employed", treatmentExpectation: 5 }, dips: { positive: [], completedAt: "2026-03-09T13:00:00.000Z" } },
  { id: "p5", name: "Camille Perret", email: "camille.perret@example.org", color: PALETTE[4], therapistId: "t2", status: "therapy", demographics: { age: 52, sex: "Female", nationality: "Frankreich", city: "Bern", occupation: "Apothekerin", living: "With partner", siblings: "1 — jüngere Schwester" }, levels: [4.5, 5, 5.5, 5.5, 5.5, 5.5, 6, 5.5], diagnosis: "Bulimia nervosa; rezidivierende depressive Episoden (Platzhalter)", disorderCategory: "eating_disorder", icd: "F50.2", caseCharacteristics: { problemDuration: "gt24m", priorPsychotherapy: true, psychotropicMedication: true, employment: "employed", treatmentExpectation: 4 }, dips: { positive: [], completedAt: "2026-03-09T15:00:00.000Z" }, hasEdeq8Series: true, hasBdiAlertSeries: true },
  { id: "p6", name: "Tim Berger", email: "tim.berger@example.org", color: PALETTE[5], therapistId: "t1", status: "interview", demographics: { age: 16, sex: "Male", nationality: "Schweiz", city: "Köniz", occupation: "Sekundarschüler", living: "With family", siblings: "2 — ältester" }, levels: [], diagnosis: null, disorderCategory: null, dips: { positive: ["social"], completedAt: "2026-07-06T14:00:00.000Z" }, hasSdqSeries: true, hasDikjSeries: true,
    // Goals defined at intake, not yet rated — demos the unrated state.
    goals: [
      {
        title: "Mündliche Mitarbeit in der Schule",
        levels: {
          "3": "Beteiligt sich ohne grosse Anspannung; Referate ohne Vermeidung",
          "2": "Hält ein kurzes Referat vor der Klasse; regelmässige Mitarbeit",
          "1": "Meldet sich in vertrauten Fächern mindestens 1× pro Woche",
          "0": "Meldet sich nie freiwillig; Referate werden vermieden oder abgesagt",
          "-1": "Zunehmendes Schweigen; Schulbesuch wird vermieden",
        },
      },
    ] },
  { id: "p7", name: "Samuel Odermatt", email: "samuel.odermatt@example.org", color: PALETTE[6], therapistId: null, status: "interview", demographics: { age: 47, sex: "Male", nationality: "Schweiz", city: "Burgdorf", occupation: "Koch", living: "Alone", siblings: "1 — Zwillingsbruder" }, levels: [], diagnosis: null, disorderCategory: null, dips: { positive: ["phobia"], completedAt: "2026-07-01T10:00:00.000Z" } },
  { id: "p8", name: "Nina Graf", email: "nina.graf@example.org", color: PALETTE[7], therapistId: null, status: "assessment", demographics: {}, levels: [], diagnosis: null, disorderCategory: null, dips: { positive: [], completedAt: "2026-07-08T10:00:00.000Z" } },

  // Concluded treatments (archive demo): 2 disorder categories × 2 years,
  // spread across therapists so the therapist-scoped archive is demoable.
  { id: "p9", name: "Lea Schmid", email: "lea.schmid@example.org", color: PALETTE[8], therapistId: "t1", status: "archived", demographics: { age: 33, sex: "Female", nationality: "Schweiz", city: "Bern", occupation: "Grafikerin", living: "Alone", siblings: "1 — ältere Schwester" }, levels: [2.5, 3, 4, 5, 5.5, 6.5, 7.5], diagnosis: "Mittelgradige depressive Episode (Platzhalter)", disorderCategory: "depression", icd: "F32.1", caseCharacteristics: { problemDuration: "m6to24", priorPsychotherapy: false, psychotropicMedication: true, employment: "employed", treatmentExpectation: 7 }, archived: { at: "2024-11-15T10:00:00.000Z", reason: "completed" }, seriesEnd: "2024-11-08", diagnosedOn: "2024-08-20", dips: { positive: [], completedAt: "2024-08-13T10:00:00.000Z" } },
  { id: "p10", name: "Marc Dubois", email: "marc.dubois@example.org", color: PALETTE[9], therapistId: "t2", status: "archived", demographics: { age: 38, sex: "Male", nationality: "Schweiz", city: "Biel/Bienne", occupation: "Versicherungsberater", living: "With family", siblings: "Keine" }, levels: [3.5, 3, 3.5, 3], diagnosis: "Soziale Angststörung (Platzhalter)", disorderCategory: "anxiety", icd: "F40.1", caseCharacteristics: { problemDuration: "gt24m", priorPsychotherapy: true, psychotropicMedication: false, employment: "unemployed", treatmentExpectation: 3 }, archived: { at: "2024-05-21T10:00:00.000Z", reason: "dropout" }, seriesEnd: "2024-05-13", diagnosedOn: "2024-04-01", dips: { positive: ["social"], completedAt: "2024-03-25T10:00:00.000Z" },
    // Archived dossier with goals (absolute dates inside the 2024 episode) —
    // exercises the read-only goals view and the summary refresh-preserve.
    goals: [
      {
        title: "Bewerbungsgespräche wahrnehmen",
        levels: {
          "3": "Geht ohne ausgeprägte Angst in Gespräche; aktive Stellensuche",
          "2": "Nimmt Gespräche regelmässig wahr; Anspannung ist handhabbar",
          "1": "Nimmt ein vorbereitetes Gespräch wahr (Rollenspiel im Vorfeld)",
          "0": "Bewerbungen werden geschrieben, Gespräche aber kurzfristig abgesagt",
          "-1": "Auch schriftliche Bewerbungen werden eingestellt",
        },
        ratings: [
          { at: "2024-04-03T10:00:00.000Z", level: 0 },
          { at: "2024-04-24T10:00:00.000Z", level: 0 },
          { at: "2024-05-10T10:00:00.000Z", level: -1 },
        ],
      },
    ] },
  { id: "p11", name: "Rahel Steck", email: "rahel.steck@example.org", color: PALETTE[0], therapistId: "t1", status: "archived", demographics: { age: 27, sex: "Female", nationality: "Schweiz", city: "Ostermundigen", occupation: "Kauffrau", living: "With partner", siblings: "2 — mittleres Kind" }, levels: [3, 3.5, 4.5, 5, 6, 6.5, 7], diagnosis: "Panikstörung mit Agoraphobie (Platzhalter)", disorderCategory: "anxiety", icd: "F40.01", caseCharacteristics: { problemDuration: "m6to24", priorPsychotherapy: false, psychotropicMedication: false, employment: "employed", treatmentExpectation: 8 }, archived: { at: "2025-03-28T10:00:00.000Z", reason: "completed" }, seriesEnd: "2025-03-21", diagnosedOn: "2025-01-10", dips: { positive: ["panic", "agora"], completedAt: "2025-01-03T10:00:00.000Z" } },
  { id: "p12", name: "Nico Furrer", email: "nico.furrer@example.org", color: PALETTE[1], therapistId: "t3", status: "archived", demographics: { age: 45, sex: "Male", nationality: "Schweiz", city: "Münsingen", occupation: "Elektriker", living: "With family", siblings: "3 — ältester" }, levels: [2, 3, 4, 5, 6, 6.5], diagnosis: "Rezidivierende depressive Störung, remittiert (Platzhalter)", disorderCategory: "depression", icd: "F33.4", caseCharacteristics: { problemDuration: "gt24m", priorPsychotherapy: true, psychotropicMedication: true, employment: "employed", treatmentExpectation: 6 }, archived: { at: "2025-09-05T10:00:00.000Z", reason: "mutual" }, seriesEnd: "2025-08-29", diagnosedOn: "2025-06-15", dips: { positive: [], completedAt: "2025-06-08T10:00:00.000Z" } },
];
