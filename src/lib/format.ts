import type { Lang } from "./i18n";

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Dates follow the active UI language. The locale is a module-level setting
// kept in sync by LangProvider (all fmtDate consumers are client components
// below the provider, so they re-render on language change). Server-side
// callers always get the German default.
const LOCALES: Record<Lang, string> = { de: "de-CH", fr: "fr-CH", en: "en-GB" };
let currentLocale = LOCALES.de;
export const setFmtLang = (lang: Lang) => {
  currentLocale = LOCALES[lang];
};

export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(currentLocale, { day: "numeric", month: "short", year: "numeric" });

export const deepCopy = <T>(o: T): T => JSON.parse(JSON.stringify(o));
