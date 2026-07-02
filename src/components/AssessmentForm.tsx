"use client";
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { tr, T, type Lang } from "@/lib/i18n";
import { MODULES } from "@/lib/dips/schema";
import { allComplete, isVisible, screeningAnswered } from "@/lib/dips/engine";
import type { DipsModule } from "@/lib/dips/types";
import type { Demographics, DipsAnswers, ModuleAnswers } from "@/lib/types";
import { Card, Field, GhostButton, PrimaryButton, inputStyle } from "./ui";
import { DipsItem, LangToggle } from "./DipsRenderer";

type SetFn = (key: string, val: string | number | boolean) => void;

export interface AssessmentPayload {
  demo: Demographics;
  dips: { lang: Lang; answers: DipsAnswers; completedAt: string };
}

function ModuleBlock({ mod, index, m, set, lang }: { mod: DipsModule; index: number; m: ModuleAnswers; set: SetFn; lang: Lang }) {
  const visSections = mod.sections
    .map((s) => ({ s, items: s.items.filter((it) => isVisible(it, m)) }))
    .filter((x) => x.items.length);
  const entered = mod.enter(m);
  const showNA = screeningAnswered(mod, m) && !entered;
  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: C.spruceSoft, color: C.spruce }}>{index}</span>
        <h3 className="lc-display text-base" style={{ color: C.ink }}>{tr(mod.title, lang)}</h3>
      </div>
      {visSections.map(({ s, items }, si) => (
        <div key={s.id} className={si === 0 ? "" : "mt-4 pt-4"} style={si === 0 ? {} : { borderTop: `1px solid ${C.line}` }}>
          {si > 0 && s.title && <p className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{tr(s.title, lang)}</p>}
          {si > 0 && s.intro && <p className="text-xs mb-2" style={{ color: C.muted }}>{tr(s.intro, lang)}</p>}
          <div className="flex flex-col gap-5 mt-2">
            {items.map((it) => <DipsItem key={it.id} item={it} m={m} set={set} lang={lang} />)}
          </div>
        </div>
      ))}
      {showNA && <p className="text-xs mt-3 rounded-lg px-3 py-2" style={{ background: C.surfaceAlt, color: C.muted }}>✓ {tr(T.notApplicable, lang)}</p>}
    </Card>
  );
}

export function AssessmentForm({ onSubmit, onCancel }: { onSubmit: (p: AssessmentPayload) => void; onCancel: () => void }) {
  const [lang, setLang] = useState<Lang>("de");
  const [demo, setDemo] = useState<Record<string, string>>({ age: "", sex: "", nationality: "", city: "", occupation: "", living: "", siblings: "" });
  const [answers, setAnswers] = useState<DipsAnswers>(() => Object.fromEntries(MODULES.map((mod) => [mod.id, {}])));
  const setFor = (modId: string): SetFn => (key, val) => setAnswers((prev) => ({ ...prev, [modId]: { ...prev[modId], [key]: val } }));
  const setD = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDemo({ ...demo, [k]: e.target.value });
  const demoOK = demo.age && demo.sex && demo.nationality && demo.city;
  const ready = Boolean(demoOK) && allComplete(answers);
  const someSkipped = MODULES.some((mod) => {
    const m = answers[mod.id] || {};
    return mod.sections.flatMap((s) => s.items).some((it) => it.showIf && !it.showIf(m) && it.code);
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="lc-display text-lg" style={{ color: C.ink }}>{tr(T.assessmentTitle, lang)}</h2>
        <div className="flex items-center gap-2"><span className="text-xs" style={{ color: C.muted }}>{tr(T.langPrompt, lang)}</span><LangToggle lang={lang} setLang={setLang} /></div>
      </div>
      <p className="text-sm mb-4" style={{ color: C.muted }}>{tr(T.assessmentIntro, lang)}</p>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{tr(T.personalDetails, lang)}</h3>
        <p className="text-xs mb-4" style={{ color: C.muted }}>{tr(T.personalNote, lang)}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`${tr(T.age, lang)} *`}><input style={inputStyle} type="number" min="0" value={demo.age} onChange={setD("age")} /></Field>
          <Field label={`${tr(T.sex, lang)} *`}><select style={inputStyle} value={demo.sex} onChange={setD("sex")}><option value="">{tr(T.select, lang)}</option>{T.sexOpts.map((o) => <option key={tr(o, "en")}>{tr(o, lang)}</option>)}</select></Field>
          <Field label={`${tr(T.nationality, lang)} *`}><input style={inputStyle} value={demo.nationality} onChange={setD("nationality")} /></Field>
          <Field label={`${tr(T.city, lang)} *`}><input style={inputStyle} value={demo.city} onChange={setD("city")} /></Field>
          <Field label={tr(T.occupation, lang)}><input style={inputStyle} value={demo.occupation} onChange={setD("occupation")} /></Field>
          <Field label={tr(T.living, lang)}><select style={inputStyle} value={demo.living} onChange={setD("living")}><option value="">{tr(T.select, lang)}</option>{T.livingOpts.map((o) => <option key={tr(o, "en")}>{tr(o, lang)}</option>)}</select></Field>
          <Field label={tr(T.siblings, lang)}><input style={inputStyle} placeholder={tr(T.siblingsPlaceholder, lang)} value={demo.siblings} onChange={setD("siblings")} /></Field>
        </div>
      </Card>

      {MODULES.map((mod, i) => <ModuleBlock key={mod.id} mod={mod} index={i + 1} m={answers[mod.id] || {}} set={setFor(mod.id)} lang={lang} />)}

      {someSkipped && <p className="text-xs mb-3" style={{ color: C.muted }}>ℹ︎ {tr(T.skipNote, lang)}</p>}
      <div className="flex gap-3 items-center flex-wrap">
        <PrimaryButton disabled={!ready} onClick={() => onSubmit({ demo, dips: { lang, answers, completedAt: new Date().toISOString() } })}>{tr(T.submit, lang)}</PrimaryButton>
        <GhostButton onClick={onCancel}>{tr(T.back, lang)}</GhostButton>
        {!ready && <span className="text-xs" style={{ color: C.muted }}>{tr(T.answerAll, lang)}</span>}
      </div>
      <p className="text-xs mt-3" style={{ color: C.muted }}>{tr(T.required, lang)}</p>
    </div>
  );
}
