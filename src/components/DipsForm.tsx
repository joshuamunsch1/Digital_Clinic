"use client";
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { tr, T, type Lang } from "@/lib/i18n";
import { MODULES } from "@/lib/dips/schema";
import { effectiveAnswers, effectiveModule, isVisible, moduleComplete, screeningAnswered } from "@/lib/dips/engine";
import type { DipsModule } from "@/lib/dips/types";
import type { DipsAnswers, ModuleAnswers } from "@/lib/types";
import { Card, GhostButton, PrimaryButton } from "./ui";
import { DipsItem, LangToggle } from "./DipsRenderer";

type SetFn = (key: string, val: string | number | boolean) => void;

export interface DipsSubmission {
  lang: Lang;
  answers: DipsAnswers;
  completedAt: string;
}

export function ModuleBlock({ mod, index, m: raw, set, lang }: { mod: DipsModule; index: number; m: ModuleAnswers; set: SetFn; lang: Lang }) {
  // Everything is read from the effective answers: what was entered under a
  // question the skip logic has since hidden stays in the form state (so a
  // corrected mis-click restores it) but must not steer the interview.
  const m = effectiveModule(mod, raw);
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
        {entered && !moduleComplete(mod, m) && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>{tr(T.incomplete, lang)}</span>
        )}
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

/// The full DIPS anxiety interview (all modules, skip logic, completeness
/// gating) — administered by the therapist since the intake split; the intake
/// itself only collects demographics (AssessmentForm).
export function DipsForm({ heading, intro, submitLabel, busy, onSubmit, onCancel }: {
  heading: React.ReactNode;
  intro?: React.ReactNode;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (dips: DipsSubmission) => void;
  onCancel: () => void;
}) {
  const [lang, setLang] = useState<Lang>("de");
  const [answers, setAnswers] = useState<DipsAnswers>(() => Object.fromEntries(MODULES.map((mod) => [mod.id, {}])));
  const [touched, setTouched] = useState(false);
  const setFor = (modId: string): SetFn => (key, val) => {
    setTouched(true);
    setAnswers((prev) => ({ ...prev, [modId]: { ...prev[modId], [key]: val } }));
  };
  const open = MODULES.filter((mod) => !moduleComplete(mod, answers[mod.id] || {}));
  const ready = open.length === 0;
  const someSkipped = MODULES.some((mod) => {
    const m = answers[mod.id] || {};
    return screeningAnswered(mod, m) && !mod.enter(effectiveModule(mod, m));
  });
  // An interview takes the better part of an hour — don't drop it on a stray click.
  const cancel = () => {
    if (!touched || window.confirm(tr(T.discardInterview, lang))) onCancel();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="lc-display text-lg" style={{ color: C.ink }}>{heading}</h2>
        <div className="flex items-center gap-2"><span className="text-xs" style={{ color: C.muted }}>{tr(T.langPrompt, lang)}</span><LangToggle lang={lang} setLang={setLang} /></div>
      </div>
      {intro && <p className="text-sm mb-4" style={{ color: C.muted }}>{intro}</p>}

      {MODULES.map((mod, i) => <ModuleBlock key={mod.id} mod={mod} index={i + 1} m={answers[mod.id] || {}} set={setFor(mod.id)} lang={lang} />)}

      {someSkipped && <p className="text-xs mb-3" style={{ color: C.muted }}>ℹ︎ {tr(T.skipNote, lang)}</p>}
      <div className="flex gap-3 items-center flex-wrap">
        {/* Submitted without the leftovers of hidden questions (effectiveAnswers). */}
        <PrimaryButton disabled={!ready || busy} onClick={() => onSubmit({ lang, answers: effectiveAnswers(answers), completedAt: new Date().toISOString() })}>
          {submitLabel ?? tr(T.submit, lang)}
        </PrimaryButton>
        <GhostButton onClick={cancel}>{tr(T.back, lang)}</GhostButton>
        {!ready && (
          <span className="text-xs" style={{ color: C.muted }}>
            {tr(T.answerAll, lang)} {tr(T.incompleteModules, lang)} {open.map((mod) => tr(mod.title, lang)).join(" · ")}
          </span>
        )}
      </div>
      <p className="text-xs mt-3" style={{ color: C.muted }}>{tr(T.required, lang)}</p>
    </div>
  );
}
