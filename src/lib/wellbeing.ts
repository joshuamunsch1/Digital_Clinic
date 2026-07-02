// Post-session wellbeing self-report (six scales -> composite 0-100 index).
export type DimKey = "mood" | "calm" | "sleep" | "energy" | "social" | "coping";

export interface Dim {
  key: DimKey;
  label: string;
  color: string;
  q: string;
}

export const DIMS: Dim[] = [
  { key: "mood", label: "Mood", color: "#C2703D", q: "How would you rate your overall mood?" },
  { key: "calm", label: "Calmness", color: "#5B7DB1", q: "How calm and relaxed have you felt?" },
  { key: "sleep", label: "Sleep", color: "#5E5A8F", q: "How well have you been sleeping?" },
  { key: "energy", label: "Energy", color: "#B9913B", q: "How much energy have you had in daily life?" },
  { key: "social", label: "Connection", color: "#A05C7B", q: "How connected have you felt to the people around you?" },
  { key: "coping", label: "Coping", color: "#2F6B5E", q: "How confident have you felt in handling your difficulties?" },
];

export const WELLBEING_NOTE_LABEL =
  "Anything from this week you'd like your therapist to know? (optional)";

export type Scores = Record<DimKey, number>;

export const composite = (s: Partial<Scores>): number =>
  Math.round((DIMS.reduce((t, d) => t + (s[d.key] ?? 0), 0) / DIMS.length) * 10);
