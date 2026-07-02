// Fictional demo data used to seed the database (and reset it).
import { clamp } from "./format";
import { DIMS } from "./wellbeing";
import { PALETTE } from "./theme";
import type { DipsAnswers, Demographics, WellbeingEntry } from "./types";

export const THERAPISTS = [
  { id: "t1", name: "Dr. Anna Keller", title: "Clinical psychologist", role: "therapist" as const },
  { id: "t2", name: "Dr. Lukas Brunner", title: "Psychotherapist", role: "therapist" as const },
  { id: "t3", name: "Dr. Sofia Ricci", title: "Clinical psychologist", role: "therapist" as const },
];
export const DIRECTOR = { id: "d1", name: "Dr. Margrit Steiner", title: "Clinic director", role: "director" as const };

const DIM_OFFSETS = [0.4, -0.8, -0.3, 0.3, -1.0, 0.2];

export function entriesFor(levels: number[]): WellbeingEntry[] {
  const base = new Date("2026-06-08").getTime();
  const n = levels.length;
  return levels.map((v, i) => {
    const scores = {} as Record<string, number>;
    DIMS.forEach((dim, d) => {
      const w = (((i * 3 + d * 5) % 5) - 2) * 0.4;
      scores[dim.key] = clamp(Math.round(v + DIM_OFFSETS[d] + w), 0, 10);
    });
    return {
      session: i,
      type: i === 0 ? ("baseline" as const) : ("session" as const),
      date: new Date(base - (n - 1 - i) * 7 * 864e5).toISOString(),
      scores: scores as WellbeingEntry["scores"],
      note: "",
    };
  });
}

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
  color: string;
  therapistId: string | null;
  status: "assessment" | "interview" | "therapy";
  demographics: Demographics;
  levels: number[];
  diagnosis: string | null;
  hasSampleDips?: boolean;
}

export const DEMO_PATIENTS: DemoPatient[] = [
  { id: "p1", name: "Mara Vogel", color: PALETTE[0], therapistId: "t1", status: "therapy", demographics: { age: 29, sex: "Female", nationality: "Swiss", city: "Bern", occupation: "Primary school teacher", living: "With partner", siblings: "1 — older brother" }, levels: [3, 3.5, 4, 4.5, 5, 5.5, 6.5, 7, 7.5], diagnosis: "Panic disorder (DSM-5) — placeholder", hasSampleDips: true },
  { id: "p2", name: "David Hofmann", color: PALETTE[1], therapistId: "t2", status: "therapy", demographics: { age: 41, sex: "Male", nationality: "Swiss", city: "Thun", occupation: "Logistics manager", living: "With family", siblings: "2 — middle child" }, levels: [5, 4.5, 3.5, 3, 4, 5, 6], diagnosis: "Adjustment disorder with anxiety (placeholder)" },
  { id: "p3", name: "Elif Demir", color: PALETTE[2], therapistId: "t1", status: "therapy", demographics: { age: 24, sex: "Female", nationality: "Turkish", city: "Biel/Bienne", occupation: "Nursing student", living: "Shared flat", siblings: "3 — youngest" }, levels: [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5], diagnosis: "Generalised anxiety disorder (placeholder)" },
  { id: "p4", name: "Jonas Wyss", color: PALETTE[3], therapistId: "t3", status: "therapy", demographics: { age: 35, sex: "Male", nationality: "Swiss", city: "Fribourg", occupation: "Software engineer", living: "Alone", siblings: "None" }, levels: [4, 5, 4, 5.5, 4.5], diagnosis: "Burnout / exhaustion syndrome (placeholder)" },
  { id: "p5", name: "Camille Perret", color: PALETTE[4], therapistId: "t2", status: "therapy", demographics: { age: 52, sex: "Female", nationality: "French", city: "Bern", occupation: "Pharmacist", living: "With partner", siblings: "1 — younger sister" }, levels: [4.5, 5, 5.5, 5.5, 5.5, 5.5, 6, 5.5], diagnosis: "Recurrent depressive disorder, mild (placeholder)" },
  { id: "p6", name: "Tim Berger", color: PALETTE[5], therapistId: "t1", status: "interview", demographics: { age: 19, sex: "Male", nationality: "Swiss", city: "Köniz", occupation: "Apprentice electrician", living: "With family", siblings: "2 — oldest" }, levels: [], diagnosis: null },
  { id: "p7", name: "Samuel Odermatt", color: PALETTE[6], therapistId: null, status: "interview", demographics: { age: 47, sex: "Male", nationality: "Swiss", city: "Burgdorf", occupation: "Chef", living: "Alone", siblings: "1 — twin brother" }, levels: [], diagnosis: null },
  { id: "p8", name: "Nina Graf", color: PALETTE[7], therapistId: null, status: "assessment", demographics: {}, levels: [], diagnosis: null },
];
