export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const deepCopy = <T>(o: T): T => JSON.parse(JSON.stringify(o));
