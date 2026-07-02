// Fictional demo data used to seed the database (and reset it).
// Demo credentials: staff passwords are role-based (director2026 / admin2026 /
// therapist2026), every demo patient uses patient2026 — see README.
import { clamp } from "./format";
import { PALETTE } from "./theme";
import type { Demographics, DipsAnswers } from "./types";
import type { RawAnswers } from "./instruments/types";

export const THERAPISTS = [
  { id: "t1", name: "Dr. Anna Keller", title: "Clinical psychologist", role: "therapist" as const, email: "anna.keller@linden-clinic.ch" },
  { id: "t2", name: "Dr. Lukas Brunner", title: "Psychotherapist", role: "therapist" as const, email: "lukas.brunner@linden-clinic.ch" },
  { id: "t3", name: "Dr. Sofia Ricci", title: "Clinical psychologist", role: "therapist" as const, email: "sofia.ricci@linden-clinic.ch" },
];
export const DIRECTOR = { id: "d1", name: "Dr. Margrit Steiner", title: "Clinic director", role: "director" as const, email: "margrit.steiner@linden-clinic.ch" };
export const ADMIN = { id: "a1", name: "Kurt Iseli", title: "Practice administration", role: "admin" as const, email: "kurt.iseli@linden-clinic.ch" };

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
/// scoring engine flips them, matching the legacy data layout.
export function pstbSessionsFor(levels: number[]): DemoSession[] {
  const base = new Date("2026-06-08").getTime();
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

// A completed multi-module DIPS for one demo patient (panic screens positive).
export const SAMPLE_ANSWERS: DipsAnswers = {
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
};

export interface DemoPatient {
  id: string;
  name: string;
  email: string;
  color: string;
  therapistId: string | null;
  status: "assessment" | "interview" | "therapy";
  demographics: Demographics;
  levels: number[];
  diagnosis: string | null;
  disorderCategory: string | null;
  hasSampleDips?: boolean;
  hasBdiSeries?: boolean;
  hasBdiAlertSeries?: boolean;
  hasEdeq8Series?: boolean;
  hasFggSeries?: boolean;
  hasDikjSeries?: boolean;
  hasSdqSeries?: boolean;
}

export const DEMO_PATIENTS: DemoPatient[] = [
  { id: "p1", name: "Mara Vogel", email: "mara.vogel@example.org", color: PALETTE[0], therapistId: "t1", status: "therapy", demographics: { age: 29, sex: "Female", nationality: "Swiss", city: "Bern", occupation: "Primary school teacher", living: "With partner", siblings: "1 — older brother" }, levels: [3, 3.5, 4, 4.5, 5, 5.5, 6.5, 7, 7.5], diagnosis: "Panic disorder (DSM-5) — placeholder", disorderCategory: "anxiety", hasSampleDips: true, hasBdiSeries: true },
  { id: "p2", name: "David Hofmann", email: "david.hofmann@example.org", color: PALETTE[1], therapistId: "t2", status: "therapy", demographics: { age: 41, sex: "Male", nationality: "Swiss", city: "Thun", occupation: "Logistics manager", living: "With family", siblings: "2 — middle child" }, levels: [5, 4.5, 3.5, 3, 4, 5, 6], diagnosis: "Adjustment disorder with anxiety (placeholder)", disorderCategory: "anxiety" },
  { id: "p3", name: "Elif Demir", email: "elif.demir@example.org", color: PALETTE[2], therapistId: "t1", status: "therapy", demographics: { age: 24, sex: "Female", nationality: "Turkish", city: "Biel/Bienne", occupation: "Nursing student", living: "Shared flat", siblings: "3 — youngest" }, levels: [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5], diagnosis: "Generalised anxiety disorder (placeholder)", disorderCategory: "anxiety" },
  { id: "p4", name: "Jonas Wyss", email: "jonas.wyss@example.org", color: PALETTE[3], therapistId: "t3", status: "therapy", demographics: { age: 35, sex: "Male", nationality: "Swiss", city: "Fribourg", occupation: "Software engineer", living: "Alone", siblings: "None" }, levels: [4, 5, 4, 5.5, 4.5], diagnosis: "Burnout / exhaustion syndrome (placeholder)", disorderCategory: "burnout", hasFggSeries: true },
  { id: "p5", name: "Camille Perret", email: "camille.perret@example.org", color: PALETTE[4], therapistId: "t2", status: "therapy", demographics: { age: 52, sex: "Female", nationality: "French", city: "Bern", occupation: "Pharmacist", living: "With partner", siblings: "1 — younger sister" }, levels: [4.5, 5, 5.5, 5.5, 5.5, 5.5, 6, 5.5], diagnosis: "Bulimia nervosa; recurrent depressive episodes (placeholder)", disorderCategory: "eating_disorder", hasEdeq8Series: true, hasBdiAlertSeries: true },
  { id: "p6", name: "Tim Berger", email: "tim.berger@example.org", color: PALETTE[5], therapistId: "t1", status: "interview", demographics: { age: 16, sex: "Male", nationality: "Swiss", city: "Köniz", occupation: "Secondary school student", living: "With family", siblings: "2 — oldest" }, levels: [], diagnosis: null, disorderCategory: null, hasSdqSeries: true, hasDikjSeries: true },
  { id: "p7", name: "Samuel Odermatt", email: "samuel.odermatt@example.org", color: PALETTE[6], therapistId: null, status: "interview", demographics: { age: 47, sex: "Male", nationality: "Swiss", city: "Burgdorf", occupation: "Chef", living: "Alone", siblings: "1 — twin brother" }, levels: [], diagnosis: null, disorderCategory: null },
  { id: "p8", name: "Nina Graf", email: "nina.graf@example.org", color: PALETTE[7], therapistId: null, status: "assessment", demographics: {}, levels: [], diagnosis: null, disorderCategory: null },
];
