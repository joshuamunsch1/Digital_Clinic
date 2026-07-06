// Minimal CSV writing shared by the archive export and the research export.

export const csvField = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvLine = (fields: (string | number | null | undefined)[]): string =>
  fields.map(csvField).join(",");

export const csvDocument = (header: string[], rows: (string | number | null | undefined)[][]): string =>
  [csvLine(header), ...rows.map(csvLine)].join("\n") + "\n";
