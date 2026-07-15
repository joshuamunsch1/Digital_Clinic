"use client";
// Full-window staff editor for the once-per-treatment intake data: the 7
// demographics fields the patient intake collects (AssessmentForm) plus the 5
// coded intake predictors (docs/outcome-prediction.md §4.3). Opened from the
// "Aufnahme & Diagnose" card on the dossier; saves via the demographics and
// caseCharacteristics PATCH actions (no status side effects).
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { T, tr, trEmployment, trProblemDuration } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import type { CaseCharacteristics, Demographics, Patient } from "@/lib/types";
import { EMPLOYMENT_STATUSES, PROBLEM_DURATIONS } from "@/lib/types";
import { Card, Field, GhostButton, PrimaryButton, SectionTitle, inputStyle } from "./ui";
import { useLang, useT } from "./LangContext";

export function IntakeEditView({ patient, onBack, onSaved }: {
  patient: Patient;
  onBack: () => void;
  onSaved: (p: Patient) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [demo, setDemo] = useState<Demographics>({ ...patient.demographics });
  const [cc, setCc] = useState<CaseCharacteristics>({ ...patient.caseCharacteristics });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const setD = (k: keyof Demographics) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDemo({ ...demo, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.updateDemographics(patient.id, demo);
      const r = await api.saveCaseCharacteristics(patient.id, cc);
      onSaved(r.patient);
      setMsg(t("intakeSaved"));
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const yesNo = (v: boolean | undefined, set: (b: boolean) => void) => (
    <div className="flex gap-1">
      {[true, false].map((b) => (
        <button key={String(b)} type="button" onClick={() => set(b)} aria-pressed={v === b}
          className="rounded-md text-xs font-semibold px-3 py-1.5"
          style={{ background: v === b ? C.spruce : C.surfaceAlt, color: v === b ? "#fff" : C.muted, border: `1px solid ${v === b ? C.spruce : C.line}`, cursor: "pointer" }}>
          {b ? t("predYes") : t("predNo")}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3"
        style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {t("backToOverview")}
      </button>

      <SectionTitle sub={t("intakeEditSub")}>{t("intakeEditTitle")} — {patient.name}</SectionTitle>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("demographicsTitle")}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={tr(T.age, lang)}>
            <input style={inputStyle} type="number" min="0" value={demo.age ?? ""} onChange={setD("age")} />
          </Field>
          <Field label={tr(T.sex, lang)}>
            {/* Canonical English tokens are stored; the UI translates on display. */}
            <select style={inputStyle} value={demo.sex ?? ""} onChange={setD("sex")}>
              <option value="">{tr(T.select, lang)}</option>
              {T.sexOpts.map((o) => <option key={tr(o, "en")} value={tr(o, "en")}>{tr(o, lang)}</option>)}
            </select>
          </Field>
          <Field label={tr(T.nationality, lang)}>
            <input style={inputStyle} value={demo.nationality ?? ""} onChange={setD("nationality")} />
          </Field>
          <Field label={tr(T.city, lang)}>
            <input style={inputStyle} value={demo.city ?? ""} onChange={setD("city")} />
          </Field>
          <Field label={tr(T.occupation, lang)}>
            <input style={inputStyle} value={demo.occupation ?? ""} onChange={setD("occupation")} />
          </Field>
          <Field label={tr(T.living, lang)}>
            <select style={inputStyle} value={demo.living ?? ""} onChange={setD("living")}>
              <option value="">{tr(T.select, lang)}</option>
              {T.livingOpts.map((o) => <option key={tr(o, "en")} value={tr(o, "en")}>{tr(o, lang)}</option>)}
            </select>
          </Field>
          <Field label={tr(T.siblings, lang)}>
            <input style={inputStyle} placeholder={tr(T.siblingsPlaceholder, lang)} value={demo.siblings ?? ""} onChange={setD("siblings")} />
          </Field>
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("predictorsTitle")}</h3>
        <p className="text-xs mb-3" style={{ color: C.muted }}>{t("predictorsSub")}</p>
        <div className="flex gap-4 flex-wrap items-end">
          <Field label={t("durationLabel")}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 160 }} value={cc.problemDuration ?? ""}
              onChange={(e) => setCc({ ...cc, ...(e.target.value ? { problemDuration: e.target.value as CaseCharacteristics["problemDuration"] } : {}) })}>
              <option value="">{t("notRecorded")}</option>
              {PROBLEM_DURATIONS.map((d) => <option key={d} value={d}>{trProblemDuration(d, lang)}</option>)}
            </select>
          </Field>
          <Field label={t("employmentLabel")}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 160 }} value={cc.employment ?? ""}
              onChange={(e) => setCc({ ...cc, ...(e.target.value ? { employment: e.target.value as CaseCharacteristics["employment"] } : {}) })}>
              <option value="">{t("notRecorded")}</option>
              {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{trEmployment(s, lang)}</option>)}
            </select>
          </Field>
          <Field label={t("priorTxLabel")}>
            {yesNo(cc.priorPsychotherapy, (b) => setCc({ ...cc, priorPsychotherapy: b }))}
          </Field>
          <Field label={t("medicationLabel")}>
            {yesNo(cc.psychotropicMedication, (b) => setCc({ ...cc, psychotropicMedication: b }))}
          </Field>
          <Field label={t("expectationLabel")}>
            <input type="number" min={0} max={10} step={1} style={{ ...inputStyle, width: 90 }}
              value={cc.treatmentExpectation ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  const { treatmentExpectation: _drop, ...rest } = cc;
                  setCc(rest);
                } else {
                  setCc({ ...cc, treatmentExpectation: Math.max(0, Math.min(10, Math.round(Number(raw)))) });
                }
              }} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3 flex-wrap">
        <PrimaryButton disabled={busy} onClick={save}>{busy ? t("working") : t("saveBtn")}</PrimaryButton>
        <GhostButton onClick={onBack}>{t("cancel")}</GhostButton>
        {msg && <span className="text-xs" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</span>}
      </div>
    </div>
  );
}
