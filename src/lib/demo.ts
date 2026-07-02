// Fictional demo data used to seed the database (and reset it).
import { clamp } from "./format";
import { PALETTE } from "./theme";
import type { Demographics, DipsAnswers } from "./types";
import type { RawAnswers } from "./instruments/types";

export const THERAPISTS = [
  { id: "t1", name: "Dr. Anna Keller", title: "Clinical psychologist", role: "therapist" as const },
  { id: "t2", name: "Dr. Lukas Brunner", title: "Psychotherapist", role: "therapist" as const },
  { id: "t3", name: "Dr. Sofia Ricci", title: "Clinical psychologist", role: "therapist" as const },
];
export const DIRECTOR = { id: "d1", name: "Dr. Margrit Steiner", title: "Clinic director", role: "director" as const };

// Item ids of the clinic-internal wellbeing check-in (see instruments/catalog.ts).
const CHECKIN_DIMS = ["mood", "calm", "sleep", "energy", "social", "coping"];
const DIM_OFFSETS = [0.4, -0.8, -0.3, 0.3, -1.0, 0.2];

export interface DemoCheckin {
  session: number;
  date: string;
  answers: RawAnswers;
  note: string;
}

/// Deterministic per-session check-in answers around a wellbeing level (0-10).
export function checkinsFor(levels: number[]): DemoCheckin[] {
  const base = new Date("2026-06-08").getTime();
  const n = levels.length;
  return levels.map((v, i) => {
    const answers: RawAnswers = {};
    CHECKIN_DIMS.forEach((dim, d) => {
      const w = (((i * 3 + d * 5) % 5) - 2) * 0.4;
      answers[dim] = clamp(Math.round(v + DIM_OFFSETS[d] + w), 0, 10);
    });
    return {
      session: i, // 0 = pre-therapy baseline
      date: new Date(base - (n - 1 - i) * 7 * 864e5).toISOString(),
      answers,
      note: "",
    };
  });
}

/// A falling BDI-FS trajectory for one demo patient (7 items, 0-3 each).
export const BDI_FS_SERIES: { daysAgo: number; answers: RawAnswers }[] = [
  { daysAgo: 84, answers: { BDI1_Traurigkeit: 2, BDI2_Pessimismus: 2, BDI3_Versagen: 2, BDI4_Freudeverlust: 2, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 2, BDI7_Suizid: 1 } }, // total 12 (severe)
  { daysAgo: 56, answers: { BDI1_Traurigkeit: 2, BDI2_Pessimismus: 1, BDI3_Versagen: 1, BDI4_Freudeverlust: 2, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 1, BDI7_Suizid: 0 } }, // total 8 (moderate)
  { daysAgo: 28, answers: { BDI1_Traurigkeit: 1, BDI2_Pessimismus: 1, BDI3_Versagen: 0, BDI4_Freudeverlust: 1, BDI5_Selbstablehnung: 1, BDI6_Selbstkritik: 1, BDI7_Suizid: 0 } }, // total 5 (mild)
  { daysAgo: 2, answers: { BDI1_Traurigkeit: 1, BDI2_Pessimismus: 0, BDI3_Versagen: 0, BDI4_Freudeverlust: 1, BDI5_Selbstablehnung: 0, BDI6_Selbstkritik: 1, BDI7_Suizid: 0 } }, // total 3 (minimal)
];

/// SDQ demo data for an adolescent: self-report and mother's parent-report at the
/// same two waves — shows the self- vs informant-rater distinction end to end.
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
  hasSampleDips?: boolean;
  hasBdiSeries?: boolean;
  hasSdqSeries?: boolean;
}

export const DEMO_PATIENTS: DemoPatient[] = [
  { id: "p1", name: "Mara Vogel", email: "mara.vogel@example.org", color: PALETTE[0], therapistId: "t1", status: "therapy", demographics: { age: 29, sex: "Female", nationality: "Swiss", city: "Bern", occupation: "Primary school teacher", living: "With partner", siblings: "1 — older brother" }, levels: [3, 3.5, 4, 4.5, 5, 5.5, 6.5, 7, 7.5], diagnosis: "Panic disorder (DSM-5) — placeholder", hasSampleDips: true, hasBdiSeries: true },
  { id: "p2", name: "David Hofmann", email: "david.hofmann@example.org", color: PALETTE[1], therapistId: "t2", status: "therapy", demographics: { age: 41, sex: "Male", nationality: "Swiss", city: "Thun", occupation: "Logistics manager", living: "With family", siblings: "2 — middle child" }, levels: [5, 4.5, 3.5, 3, 4, 5, 6], diagnosis: "Adjustment disorder with anxiety (placeholder)" },
  { id: "p3", name: "Elif Demir", email: "elif.demir@example.org", color: PALETTE[2], therapistId: "t1", status: "therapy", demographics: { age: 24, sex: "Female", nationality: "Turkish", city: "Biel/Bienne", occupation: "Nursing student", living: "Shared flat", siblings: "3 — youngest" }, levels: [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5], diagnosis: "Generalised anxiety disorder (placeholder)" },
  { id: "p4", name: "Jonas Wyss", email: "jonas.wyss@example.org", color: PALETTE[3], therapistId: "t3", status: "therapy", demographics: { age: 35, sex: "Male", nationality: "Swiss", city: "Fribourg", occupation: "Software engineer", living: "Alone", siblings: "None" }, levels: [4, 5, 4, 5.5, 4.5], diagnosis: "Burnout / exhaustion syndrome (placeholder)" },
  { id: "p5", name: "Camille Perret", email: "camille.perret@example.org", color: PALETTE[4], therapistId: "t2", status: "therapy", demographics: { age: 52, sex: "Female", nationality: "French", city: "Bern", occupation: "Pharmacist", living: "With partner", siblings: "1 — younger sister" }, levels: [4.5, 5, 5.5, 5.5, 5.5, 5.5, 6, 5.5], diagnosis: "Recurrent depressive disorder, mild (placeholder)" },
  { id: "p6", name: "Tim Berger", email: "tim.berger@example.org", color: PALETTE[5], therapistId: "t1", status: "interview", demographics: { age: 16, sex: "Male", nationality: "Swiss", city: "Köniz", occupation: "Secondary school student", living: "With family", siblings: "2 — oldest" }, levels: [], diagnosis: null, hasSdqSeries: true },
  { id: "p7", name: "Samuel Odermatt", email: "samuel.odermatt@example.org", color: PALETTE[6], therapistId: null, status: "interview", demographics: { age: 47, sex: "Male", nationality: "Swiss", city: "Burgdorf", occupation: "Chef", living: "Alone", siblings: "1 — twin brother" }, levels: [], diagnosis: null },
  { id: "p8", name: "Nina Graf", email: "nina.graf@example.org", color: PALETTE[7], therapistId: null, status: "assessment", demographics: {}, levels: [], diagnosis: null },
];
