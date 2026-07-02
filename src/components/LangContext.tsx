"use client";
// UI language context: default German, persisted in localStorage, switchable
// from the login screen and the app header. Clinical content (instrument
// names, PSTB item wording) is intentionally NOT translated.
import React, { createContext, useContext, useEffect, useState } from "react";
import { LANGS, trUI, type Lang, type UIKey } from "@/lib/i18n";
import { C } from "@/lib/theme";

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "de", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("de");
  useEffect(() => {
    const stored = window.localStorage.getItem("linden_lang");
    if (stored === "de" || stored === "fr" || stored === "en") setLangState(stored);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("linden_lang", l);
  };
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/// t("key") / t("key", { name: "Mara" }) — translated UI string in the active language.
export function useT() {
  const { lang } = useLang();
  return (key: UIKey, vars?: Record<string, string | number>) => trUI(key, lang, vars);
}

export function LangSwitcher({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div className="flex gap-1" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          className="rounded-md text-xs font-bold px-2 py-1"
          style={{
            background: lang === l.id ? C.spruce : "transparent",
            color: lang === l.id ? "#fff" : C.muted,
            border: `1px solid ${lang === l.id ? C.spruce : C.line}`,
            cursor: "pointer",
          }}
          title={l.label}
        >
          {compact ? l.id.toUpperCase() : l.label}
        </button>
      ))}
    </div>
  );
}
