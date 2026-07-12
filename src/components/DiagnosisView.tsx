"use client";
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { tr, trCategory } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import type { InstrumentDef } from "@/lib/instruments/types";
import type { Patient, Therapist } from "@/lib/types";
import { DISORDER_CATEGORIES } from "@/lib/types";
import { evaluateDips, primaryProposal, type ModuleEvaluation } from "@/lib/dips/diagnosis";
import { recommendationsForPatient } from "@/lib/recommendations";
import { Card, Field, GhostButton, PrimaryButton, SectionTitle, StatusBadge, inputStyle } from "./ui";
import { DipsSummary } from "./DipsSummary";
import { useLang, useT } from "./LangContext";

function EvaluationCard({ evaluation, lang }: { evaluation: ModuleEvaluation; lang: "de" | "fr" | "en" }) {
  const t = useT();
  const met = evaluation.met;
  return (
    <Card className="p-4 mb-3" style={met ? { border: `1px solid ${C.spruce}` } : {}}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold" style={{ color: C.ink }}>{tr(evaluation.label, lang)}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: C.blueSoft, color: C.blue }}>
          {evaluation.icdCode}
        </span>
        {met ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.spruceSoft, color: C.spruce }}>
            {t("proposalTag")}
          </span>
        ) : (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
            {t("screenedNotMet")}
          </span>
        )}
      </div>
      <p className="text-xs font-bold mt-3 mb-1" style={{ color: C.muted }}>{t("criteriaHeading")}</p>
      <div className="flex flex-col gap-1">
        {evaluation.criteria.map((c) => (
          <div key={c.key} className="flex items-start gap-2 text-sm">
            <span style={{ color: c.met ? C.spruce : C.muted, minWidth: 16 }}>{c.met ? "✓" : "—"}</span>
            <span style={{ color: c.met ? C.ink : C.muted }}>
              {tr(c.label, lang)}
              {c.detail && <span className="text-xs" style={{ color: C.muted }}> · {c.detail}</span>}
            </span>
          </div>
        ))}
      </div>
      {evaluation.caveats.length > 0 && (
        <>
          <p className="text-xs font-bold mt-3 mb-1" style={{ color: C.amber }}>{t("caveatsHeading")}</p>
          <ul className="flex flex-col gap-1">
            {evaluation.caveats.map((cv, i) => (
              <li key={i} className="text-xs" style={{ color: C.amber }}>⚠ {tr(cv, lang)}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/// Full-window diagnostics: mechanical DIPS evaluation with per-criterion
/// breakdown, the interview record, the (proposed or confirmed) diagnosis,
/// diagnosis-specific questionnaire recommendations and guideline references.
export function DiagnosisView({ patient, therapists, instruments, onBack, onSaveDiagnosis, onStartDips }: {
  patient: Patient;
  therapists: Therapist[];
  instruments: InstrumentDef[];
  onBack: () => void;
  onSaveDiagnosis: (id: string, text: string, category: string, icdCode?: string) => void;
  onStartDips: (id: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const evaluations = useMemo(() => (patient.dips ? evaluateDips(patient.dips.answers) : []), [patient.dips]);
  const proposal = useMemo(() => (patient.dips ? primaryProposal(patient.dips.answers) : null), [patient.dips]);
  const recommendations = useMemo(
    () => recommendationsForPatient({ disorderCategory: patient.disorderCategory, dips: patient.dips }),
    [patient.disorderCategory, patient.dips],
  );
  const [dxText, setDxText] = useState(proposal?.suggestedText ?? "");
  const [dxCategory, setDxCategory] = useState<string>(proposal?.disorderCategory ?? patient.disorderCategory ?? "other");
  const [dxIcd, setDxIcd] = useState(proposal?.icdCode ?? "");

  const entered = evaluations.filter((e) => e.entered);
  const notEntered = evaluations.filter((e) => !e.entered);
  const conductedBy = therapists.find((th) => th.id === patient.dips?.conductedById);
  const instrumentById = new Map(instruments.map((i) => [i.id, i]));
  const guidelines = recommendations.flatMap((s) => s.guidelines)
    .filter((g, i, all) => all.findIndex((x) => x.url === g.url) === i);

  return (
    <div className="max-w-4xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3"
        style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {t("backToOverview")}
      </button>

      <SectionTitle sub={t("diagnosisViewSub")}>{t("diagnosisViewTitle")} — {patient.name}</SectionTitle>

      <Card className="p-4 mb-4" style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
        <p className="text-sm font-semibold" style={{ color: C.amber }}>{t("mechanicalBanner")}</p>
      </Card>

      {/* Confirmed diagnosis or confirm form */}
      <Card className="p-5 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("diagnosisTitle")}</h3>
          <StatusBadge status={patient.status} />
        </div>
        {patient.diagnosis ? (
          <div>
            <p className="text-sm font-semibold" style={{ color: C.ink }}>
              {patient.diagnosis.text}
              {patient.icdCode && (
                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full align-middle" style={{ background: C.blueSoft, color: C.blue }}>
                  {patient.icdCode}
                </span>
              )}
            </p>
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              {t("recordedOn")} {fmtDate(patient.diagnosis.date)} · {patient.diagnosis.by}
              {patient.disorderCategory ? ` · ${trCategory(patient.disorderCategory, lang)}` : ""}
            </p>
          </div>
        ) : !patient.dips ? (
          <div>
            <p className="text-sm mb-3" style={{ color: C.muted }}>{t("dipsRequired")}</p>
            <PrimaryButton small onClick={() => onStartDips(patient.id)}>{t("startDipsInterview")}</PrimaryButton>
          </div>
        ) : (
          <div>
            <p className="text-sm mb-2" style={{ color: C.muted }}>{t("notConfirmedYet")}</p>
            {proposal && (
              <p className="mb-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>{t("proposalChip")}</span>
              </p>
            )}
            <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} placeholder={t("diagnosisPlaceholder")} value={dxText} onChange={(e) => setDxText(e.target.value)} />
            <div className="mt-2 flex items-end gap-2 flex-wrap">
              <Field label={t("disorderCategoryLabel")}>
                <select style={{ ...inputStyle, width: "auto", minWidth: 170 }} value={dxCategory} onChange={(e) => setDxCategory(e.target.value)}>
                  {DISORDER_CATEGORIES.map((c) => <option key={c} value={c}>{trCategory(c, lang)}</option>)}
                </select>
              </Field>
              <Field label={t("icdLabel")}>
                <input style={{ ...inputStyle, width: 110 }} placeholder="F41.0" value={dxIcd} onChange={(e) => setDxIcd(e.target.value.toUpperCase())} />
              </Field>
              <PrimaryButton small disabled={!dxText.trim()} onClick={() => onSaveDiagnosis(patient.id, dxText.trim(), dxCategory, dxIcd.trim() || undefined)}>
                {t("saveDiagnosis")}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Card>

      {/* Mechanical evaluation per module */}
      {patient.dips && (
        <div className="mb-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: C.spruce }}>{t("proposalsHeading")}</h3>
          {entered.length === 0 && <Card className="p-4 mb-3"><p className="text-sm" style={{ color: C.muted }}>{t("noProposal")}</p></Card>}
          {entered.map((e) => <EvaluationCard key={e.moduleId} evaluation={e} lang={lang} />)}
          {notEntered.length > 0 && (
            <p className="text-xs" style={{ color: C.muted }}>
              {t("notEnteredNote", { modules: notEntered.map((e) => tr(e.label, lang)).join(", ") })}
            </p>
          )}
        </div>
      )}

      {/* Full interview record */}
      {patient.dips && (
        <Card className="p-5 mb-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("dipsResultsHeading")}</h3>
            <span className="text-xs" style={{ color: C.muted }}>
              {fmtDate(patient.dips.completedAt)}
              {conductedBy ? ` · ${t("conductedByLabel")} ${conductedBy.name}` : ""}
            </span>
          </div>
          <DipsSummary patient={patient} />
        </Card>
      )}

      {/* Recommendations */}
      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("recommendedHeading")}</h3>
        <p className="text-xs mb-3" style={{ color: C.muted }}>{t("recommendedSub")}</p>
        {recommendations.length === 0 && <p className="text-sm" style={{ color: C.muted }}>{t("noRecommendations")}</p>}
        {recommendations.map((set) => (
          <div key={set.key} className="mb-3">
            <p className="text-sm font-semibold mb-1" style={{ color: C.ink }}>{set.labelDe}</p>
            <div className="flex flex-col gap-1.5">
              {set.catalogInstrumentIds.map((id) => {
                const inst = instrumentById.get(id);
                if (!inst) return null;
                return (
                  <div key={id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-1.5" style={{ background: C.surfaceAlt }}>
                    <span className="text-sm font-semibold" style={{ color: C.ink }}>{inst.abbreviation}</span>
                    <span className="text-xs" style={{ color: C.muted }}>{inst.name}</span>
                    <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.spruceSoft, color: C.spruce }}>
                      {t("inCatalogTag")}
                    </span>
                  </div>
                );
              })}
              {set.external.length > 0 && (
                <div className="rounded-lg px-3 py-2" style={{ border: `1px dashed ${C.line}` }}>
                  <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("externalInstrumentsHeading")}</p>
                  {set.external.map((ex, i) => (
                    <p key={i} className="text-xs" style={{ color: C.ink }}>
                      {ex.abbr ? <strong>{ex.abbr}</strong> : null}{ex.abbr ? " — " : ""}{ex.name}
                      {ex.note && <span style={{ color: C.muted }}> ({ex.note})</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>

      {/* Guidelines */}
      {guidelines.length > 0 && (
        <Card className="p-5 mb-4">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("guidelinesHeading")}</h3>
          <div className="flex flex-col gap-3">
            {guidelines.map((g) => (
              <div key={g.url} className="rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                <p className="text-sm font-semibold" style={{ color: C.ink }}>{g.title}</p>
                <p className="text-xs" style={{ color: C.muted }}>
                  {g.org}{g.registryNr ? ` · AWMF-Register ${g.registryNr}` : ""}{g.status ? ` · ${g.status}` : ""}
                </p>
                <p className="text-sm mt-1" style={{ color: C.ink }}>{g.summary}</p>
                <a href={g.url} target="_blank" rel="noreferrer" className="text-xs font-semibold" style={{ color: C.spruce, textDecoration: "none" }}>
                  {t("guidelineOpen")}
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
