/// Handwritten ink notes for free-text fields (DIPS "Beschreiben" follow-ups
/// and comment textareas): strokes captured from pointer events (pen, finger
/// or mouse) and stored as a compact JSON string in the ordinary answer map
/// under a sibling `<textKey>_ink` key — a plain string, so no schema or
/// answer-type change. Handwriting is kept as written (never converted to
/// text); tablet-OS handwriting-to-text still targets the text field itself.
/// Pure helpers only — parsing validates every number, so downstream SVG
/// rendering can trust the data even if rawAnswers were tampered with.

export interface InkStroke {
  x: number[];
  y: number[];
  /// Stroke width in CSS px, derived from pointer pressure at capture time.
  w: number;
}

export interface InkNote {
  v: 1;
  w: number; // drawing surface width in CSS px
  h: number; // drawing surface height in CSS px
  strokes: InkStroke[];
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function parseInk(s: unknown): InkNote | null {
  if (typeof s !== "string" || !s) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch {
    return null;
  }
  const n = raw as InkNote;
  if (!n || typeof n !== "object" || n.v !== 1) return null;
  if (!finite(n.w) || !finite(n.h) || n.w <= 0 || n.h <= 0) return null;
  if (!Array.isArray(n.strokes)) return null;
  for (const st of n.strokes) {
    if (!st || typeof st !== "object") return null;
    if (!finite(st.w) || st.w <= 0) return null;
    if (!Array.isArray(st.x) || !Array.isArray(st.y)) return null;
    if (st.x.length !== st.y.length || st.x.length === 0) return null;
    if (!st.x.every(finite) || !st.y.every(finite)) return null;
  }
  return n;
}

export const inkIsEmpty = (n: InkNote): boolean => n.strokes.length === 0;

export const serializeInk = (n: InkNote): string => JSON.stringify(n);

const r1 = (n: number) => Math.round(n * 10) / 10;

/// Quadratic-midpoint smoothing: each recorded point becomes the control
/// point of a curve through segment midpoints — cheap and pen-like.
export function strokePath(st: InkStroke): string {
  const { x, y } = st;
  if (x.length === 1) return `M${r1(x[0])} ${r1(y[0])}L${r1(x[0])} ${r1(y[0])}`;
  let d = `M${r1(x[0])} ${r1(y[0])}`;
  for (let i = 1; i < x.length; i++) {
    const mx = (x[i - 1] + x[i]) / 2;
    const my = (y[i - 1] + y[i]) / 2;
    d += `Q${r1(x[i - 1])} ${r1(y[i - 1])} ${r1(mx)} ${r1(my)}`;
  }
  d += `L${r1(x[x.length - 1])} ${r1(y[y.length - 1])}`;
  return d;
}

/// Standalone SVG markup (FHIR attachment / export use). Built exclusively
/// from validated numbers, so the output cannot carry injected markup.
export function inkToSvg(n: InkNote, color = "#1d2722"): string {
  const paths = n.strokes
    .map((st) => `<path d="${strokePath(st)}" stroke-width="${r1(st.w)}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(n.w)} ${r1(n.h)}" ` +
    `fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  );
}

/// Base64 for FHIR Attachment.data — works in both browser (DipsSummary
/// renders the payload client-side) and Node (relay/export).
export function toBase64(s: string): string {
  if (typeof btoa !== "undefined") return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, "utf8").toString("base64");
}

/// Answer-map convention: the ink note lives next to its text field.
export const inkKey = (textKey: string) => `${textKey}_ink`;
