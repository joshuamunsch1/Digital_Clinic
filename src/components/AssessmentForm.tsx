"use client";
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { tr, T, type Lang } from "@/lib/i18n";
import type { Demographics } from "@/lib/types";
import { Card, Field, GhostButton, PrimaryButton, inputStyle } from "./ui";
import { LangToggle } from "./DipsRenderer";

/// Patient intake since the DIPS split: demographics only. The DIPS anxiety
/// interview is administered by the therapist afterwards (DipsForm, opened
/// from the patient dossier).
export interface AssessmentPayload {
  demo: Demographics;
}

export function AssessmentForm({ onSubmit, onCancel }: { onSubmit: (p: AssessmentPayload) => void; onCancel: () => void }) {
  const [lang, setLang] = useState<Lang>("de");
  const [demo, setDemo] = useState<Record<string, string>>({ age: "", sex: "", nationality: "", city: "", occupation: "", living: "", siblings: "" });
  const setD = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDemo({ ...demo, [k]: e.target.value });
  const ready = Boolean(demo.age && demo.sex && demo.nationality && demo.city);

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

      <div className="flex gap-3 items-center flex-wrap">
        <PrimaryButton disabled={!ready} onClick={() => onSubmit({ demo })}>{tr(T.submit, lang)}</PrimaryButton>
        <GhostButton onClick={onCancel}>{tr(T.back, lang)}</GhostButton>
        {!ready && <span className="text-xs" style={{ color: C.muted }}>{tr(T.answerAll, lang)}</span>}
      </div>
      <p className="text-xs mt-3" style={{ color: C.muted }}>{tr(T.required, lang)}</p>
    </div>
  );
}
