// One-off generator for the placeholder document templates in templates/documents/.
// Run: npx tsx scripts/generate-doc-templates.ts
//
// Hand-assembles minimal single-page A4 PDFs (Helvetica, WinAnsiEncoding) so the
// prototype carries no PDF dependency. The committed PDFs are this script's
// output — regenerate and re-commit when the wording changes. The real clinic
// will replace these with its own predefined forms.
import fs from "node:fs";
import path from "node:path";
import { DOC_TITLES_DE, STANDARD_DOC_SEQUENCE } from "../src/lib/document-types";

type Line =
  | { kind: "title"; text: string }
  | { kind: "sub"; text: string }
  | { kind: "text"; text: string }
  | { kind: "label"; text: string } // small label with a fill-in rule underneath
  | { kind: "gap" };

const LEFT = 56;
const RIGHT = 539;

/// Escape a string for a PDF literal string under WinAnsiEncoding.
/// ASCII passes through; latin-1 (umlauts, ß) becomes octal escapes.
function esc(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "(" || ch === ")") out += "\\" + ch;
    else if (code >= 32 && code < 127) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += "\\" + code.toString(8).padStart(3, "0");
    else throw new Error(`character outside latin-1, not representable: "${ch}" in "${s}"`);
  }
  return out;
}

function contentStream(lines: Line[]): string {
  const ops: string[] = ["0.6 w"];
  let y = 780;
  const text = (font: "F1" | "F2", size: number, s: string) =>
    ops.push(`BT /${font} ${size} Tf ${LEFT} ${y} Td (${esc(s)}) Tj ET`);
  for (const line of lines) {
    switch (line.kind) {
      case "title":
        text("F1", 20, line.text);
        y -= 14;
        break;
      case "sub":
        ops.push("0.45 g");
        text("F2", 9, line.text);
        ops.push("0 g");
        y -= 26;
        break;
      case "text":
        text("F2", 11, line.text);
        y -= 17;
        break;
      case "label":
        text("F2", 10, line.text);
        y -= 22;
        ops.push(`${LEFT} ${y + 4} m ${RIGHT} ${y + 4} l S`);
        y -= 14;
        break;
      case "gap":
        y -= 14;
        break;
    }
  }
  return ops.join("\n");
}

function buildPdf(lines: Line[]): Buffer {
  const content = contentStream(lines);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // esc() keeps everything ASCII/latin-1, so string length == byte length above.
  return Buffer.from(pdf, "latin1");
}

const SUB = "Linden-Klinik · Platzhaltervorlage (Prototyp, kein rechtsgültiges Dokument)";

const TEMPLATES: Record<(typeof STANDARD_DOC_SEQUENCE)[number], Line[]> = {
  consent: [
    { kind: "title", text: DOC_TITLES_DE.consent },
    { kind: "sub", text: SUB },
    { kind: "text", text: "Hiermit erkläre ich mich mit der psychotherapeutischen Behandlung an der" },
    { kind: "text", text: "Linden-Klinik einverstanden. Ich wurde über Ablauf, Ziele, Dauer und mögliche" },
    { kind: "text", text: "Risiken der Behandlung sowie über die Erhebung von Fragebogendaten zur" },
    { kind: "text", text: "Verlaufsmessung aufgeklärt." },
    { kind: "gap" },
    { kind: "label", text: "Name der Patientin / des Patienten" },
    { kind: "label", text: "Geburtsdatum" },
    { kind: "label", text: "Gesetzliche Vertretung (bei Minderjährigen)" },
    { kind: "gap" },
    { kind: "label", text: "Ort, Datum" },
    { kind: "label", text: "Unterschrift" },
  ],
  confidentiality: [
    { kind: "title", text: DOC_TITLES_DE.confidentiality },
    { kind: "sub", text: SUB },
    { kind: "text", text: "Vereinbarung über die vertrauliche Behandlung aller im Rahmen der Therapie" },
    { kind: "text", text: "erhobenen Informationen (Schweigepflicht) sowie über Umfang und Grenzen der" },
    { kind: "text", text: "Weitergabe an Dritte (z. B. zuweisende Stellen, Krankenversicherung)." },
    { kind: "gap" },
    { kind: "label", text: "Name der Patientin / des Patienten" },
    { kind: "label", text: "Entbindung von der Schweigepflicht gegenüber (optional)" },
    { kind: "gap" },
    { kind: "label", text: "Ort, Datum" },
    { kind: "label", text: "Unterschrift" },
  ],
  emergency_contacts: [
    { kind: "title", text: DOC_TITLES_DE.emergency_contacts },
    { kind: "sub", text: SUB },
    { kind: "text", text: "Im Notfall: 144 (Sanität) · 143 (Die Dargebotene Hand) · 112 (Europäischer Notruf)" },
    { kind: "gap" },
    { kind: "label", text: "Kontakt 1 · Name und Beziehung" },
    { kind: "label", text: "Kontakt 1 · Telefon" },
    { kind: "gap" },
    { kind: "label", text: "Kontakt 2 · Name und Beziehung" },
    { kind: "label", text: "Kontakt 2 · Telefon" },
    { kind: "gap" },
    { kind: "label", text: "Hausärztin / Hausarzt · Name und Telefon" },
  ],
  personal_goals: [
    { kind: "title", text: DOC_TITLES_DE.personal_goals },
    { kind: "sub", text: SUB },
    { kind: "text", text: "Welche Ziele möchten Sie in der Therapie erreichen? Woran würden Sie merken," },
    { kind: "text", text: "dass sich etwas verbessert hat?" },
    { kind: "gap" },
    { kind: "label", text: "Ziel 1" },
    { kind: "label", text: "Ziel 2" },
    { kind: "label", text: "Ziel 3" },
    { kind: "gap" },
    { kind: "label", text: "Besprochen am / mit" },
  ],
  report: [
    { kind: "title", text: DOC_TITLES_DE.report },
    { kind: "sub", text: SUB },
    { kind: "label", text: "Patientin / Patient" },
    { kind: "label", text: "Berichtszeitraum" },
    { kind: "label", text: "Verfasst von" },
    { kind: "gap" },
    { kind: "text", text: "Zusammenfassung des Behandlungsverlaufs (Platzhalter):" },
    { kind: "label", text: "" },
    { kind: "label", text: "" },
    { kind: "label", text: "" },
    { kind: "label", text: "" },
  ],
};

const outDir = path.join(process.cwd(), "templates", "documents");
fs.mkdirSync(outDir, { recursive: true });
for (const docType of STANDARD_DOC_SEQUENCE) {
  const file = path.join(outDir, `${docType}.pdf`);
  fs.writeFileSync(file, buildPdf(TEMPLATES[docType]));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
