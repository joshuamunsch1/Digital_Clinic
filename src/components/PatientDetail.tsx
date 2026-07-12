"use client";
import React, { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { tr, T, trCategory, trCadence, trDemoValue, trEmployment, trInvitationStatus, trPopulation, trProblemDuration, trRaterRole, trSessionLogType, trSource, trTerminationReason } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { api } from "@/lib/api-client";
import type { InstrumentDef } from "@/lib/instruments/types";
import { isScoreable } from "@/lib/instruments/types";
import type { CaseCharacteristics, InvitationRecord, Patient, ResponseRecord, SessionUser, Therapist } from "@/lib/types";
import { DIPS_INSTRUMENT_ID, DISORDER_CATEGORIES, EMPLOYMENT_STATUSES, PROBLEM_DURATIONS, RATER_ROLES, SESSION_LOG_TYPES, TERMINATION_REASONS, activeAlerts, fmtScore, latestSessionScore, responsesFor } from "@/lib/types";
import type { PredictionPayload } from "@/lib/prediction/service";
import { primaryProposal } from "@/lib/dips/diagnosis";
import { Card, Field, GhostButton, PrimaryButton, StatusBadge, TrendArrow, inputStyle } from "./ui";
import { ScoreTable, SummaryStrip, TrajectoryChart, occasionOf, type ChartPrediction } from "./charts";
import { DipsSummary } from "./DipsSummary";
import { DocumentsPanel } from "./DocumentsPanel";
import { ChannelChip } from "./MonitoringView";
import { InstrumentForm } from "./InstrumentForm";
import { PredictionPanel, type BandSource } from "./PredictionPanel";
import { useLang, useT } from "./LangContext";

function DefinitionBadge({ instrument }: { instrument: InstrumentDef }) {
  const t = useT();
  if (instrument.definitionStatus === "complete") return null;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}
      title={t("definitionBadgeTitle")}>
      {t("definitionBadge", { status: instrument.definitionStatus.replace("_", " ") })}
    </span>
  );
}

/// One individual filled-out questionnaire, expandable to its raw answers.
function ResponseRow({ instrument, response, therapists }: { instrument: InstrumentDef; response: ResponseRecord; therapists: Therapist[] }) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const occ = occasionOf(instrument, response);
  const conductedBy = therapists.find((th) => th.id === response.conductedById);
  return (
    <div className="rounded-lg" style={{ background: C.surfaceAlt }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left px-3 py-2 flex items-center gap-3 flex-wrap" style={{ background: "none", border: "none", cursor: "pointer" }}>
        <span className="text-xs font-bold" style={{ color: C.ink }}>{occ.label}</span>
        <span className="text-xs" style={{ color: C.muted }}>
          {fmtDate(response.occurredAt)} · {trRaterRole(response.respondentRole, lang)} · {t("via")} {trSource(response.source, lang)}
          {conductedBy ? ` · ${t("conductedBy")}: ${conductedBy.name}` : ""}
        </span>
        <span className="ml-auto text-xs" style={{ color: C.spruce }}>{open ? t("hideAnswers") : t("viewAnswers")}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <table className="text-xs w-full" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {instrument.items.length
                ? instrument.items.map((it) => (
                    <tr key={it.id} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-1 pr-3" style={{ color: C.muted }}>{it.text ?? it.label}{it.reverseScored ? ` ${t("reverseScored")}` : ""}</td>
                      <td className="py-1 text-right" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{response.rawAnswers[it.id] ?? "—"}</td>
                    </tr>
                  ))
                : Object.entries(response.rawAnswers).map(([k, v]) => (
                    <tr key={k} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-1 pr-3" style={{ color: C.muted }}>{k}</td>
                      <td className="py-1 text-right" style={{ color: C.ink }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                    </tr>
                  ))}
              {Object.entries(response.scores).length > 0 && (
                <tr style={{ borderTop: `2px solid ${C.line}` }}>
                  <td className="py-1 pr-3 font-bold" style={{ color: C.spruce }}>{t("computedScores")}</td>
                  <td className="py-1 text-right" style={{ color: C.spruce, fontVariantNumeric: "tabular-nums" }}>
                    {instrument.scales.filter((s) => response.scores[s.key] !== undefined).map((s) => `${s.label}: ${response.scores[s.key]}`).join(" · ")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {response.note && <p className="text-xs mt-2" style={{ color: C.ink }}>{t("noteQuote")}: “{response.note}”</p>}
        </div>
      )}
    </div>
  );
}

function InstrumentCard({ instrument, responses, therapists, chartPrediction }: { instrument: InstrumentDef; responses: ResponseRecord[]; therapists: Therapist[]; chartPrediction?: ChartPrediction }) {
  const t = useT();
  const { lang } = useLang();
  const [showAll, setShowAll] = useState(false);
  const occasions = new Set(responses.map((r) => occasionOf(instrument, r).key)).size;
  const scoreable = isScoreable(instrument);
  const list = showAll ? [...responses].reverse() : [];
  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{instrument.abbreviation} · {instrument.name}</h3>
        <DefinitionBadge instrument={instrument} />
        <span className="ml-auto text-xs" style={{ color: C.muted }}>{responses.length} {t("responsesN")}</span>
      </div>
      <p className="text-xs mb-3" style={{ color: C.muted }}>
        {trRaterRole(instrument.raterRole, lang)} · {trCadence(instrument.cadenceType, lang)} · {trPopulation(instrument.population, lang)}
      </p>
      {scoreable && occasions >= 2 && (
        <div className="mb-3"><TrajectoryChart instrument={instrument} responses={responses} prediction={chartPrediction} /></div>
      )}
      {scoreable && <div className="mb-3"><ScoreTable instrument={instrument} responses={responses} /></div>}
      {!scoreable && (
        <p className="text-xs mb-3" style={{ color: C.amber }}>{t("notScored", { status: instrument.definitionStatus })}</p>
      )}
      <button type="button" onClick={() => setShowAll(!showAll)} className="text-xs font-semibold" style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {showAll ? t("hideIndividual") : t("viewIndividual")}
      </button>
      {showAll && (
        <div className="flex flex-col gap-2 mt-2">
          {list.map((r) => <ResponseRow key={r.id} instrument={instrument} response={r} therapists={therapists} />)}
        </div>
      )}
    </Card>
  );
}

/// Get data in: send a LimeSurvey link, upload a LimeSurvey CSV export, or type
/// a paper form in manually. See docs/limesurvey-integration.md.
function AddDataPanel({ patient, instruments, onStartManualEntry, onRefresh }: {
  patient: Patient;
  instruments: InstrumentDef[];
  onStartManualEntry: (inst: InstrumentDef) => void;
  onRefresh: (p: Patient) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const candidates = useMemo(
    () => instruments.filter((i) => i.id !== DIPS_INSTRUMENT_ID && i.instrumentType === "likert_battery"),
    [instruments],
  );
  const [instId, setInstId] = useState(candidates[0]?.id ?? "");
  const inst = candidates.find((i) => i.id === instId);
  const [role, setRole] = useState("self");
  const [wave, setWave] = useState("");
  const [email, setEmail] = useState(patient.email ?? "");
  const [surveyId, setSurveyId] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const isWave = inst?.cadenceType === "wave";
  const waves = inst?.cadenceConfig.waves ?? ["pre", "zm", "post", "postF"];

  const run = async (fn: () => Promise<{ patient: Patient } & Record<string, unknown>>, done: (r: Record<string, unknown>) => string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      onRefresh(r.patient);
      setMsg(done(r));
    } catch (e) {
      setMsg(`✗ ${(e as Error).message === "network_restricted" ? t("networkRestricted") : (e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!inst) return null;
  const canEnterManually = inst.items.length > 0 && inst.definitionStatus === "complete";
  return (
    <Card className="p-5 mb-4">
      <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("collectTitle")}</h3>
      <div className="flex gap-3 flex-wrap mb-3">
        <Field label={t("instrumentLabel")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 260 }} value={instId} onChange={(e) => { setInstId(e.target.value); setSurveyId(""); setMsg(null); }}>
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>
                {i.abbreviation} — {trRaterRole(i.raterRole, lang)} ({trPopulation(i.population, lang)})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("ratedBy")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 120 }} value={role} onChange={(e) => setRole(e.target.value)}>
            {RATER_ROLES.map((r) => <option key={r} value={r}>{trRaterRole(r, lang)}</option>)}
          </select>
        </Field>
        {isWave && (
          <Field label={t("waveLabel")}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 110 }} value={wave} onChange={(e) => setWave(e.target.value)}>
              <option value="">—</option>
              {waves.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg p-3" style={{ background: C.surfaceAlt }}>
          <p className="text-xs font-bold mb-2" style={{ color: C.ink }}>{t("inviteHeading")}</p>
          <div className="flex flex-col gap-2">
            <input style={inputStyle} placeholder={t("recipientEmail")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input
              style={inputStyle}
              placeholder={inst.limesurveySurveyId ? t("surveyIdLinked", { id: inst.limesurveySurveyId }) : t("surveyIdUnlinked")}
              value={surveyId}
              onChange={(e) => setSurveyId(e.target.value)}
            />
            <PrimaryButton small disabled={busy || !email.trim() || (!surveyId.trim() && !inst.limesurveySurveyId)}
              onClick={() => run(
                () => api.createInvitation(patient.id, {
                  instrumentId: inst.id,
                  respondentRole: role,
                  email: email.trim(),
                  wave: isWave && wave ? wave : undefined,
                  surveyId: surveyId.trim() || undefined,
                }),
                () => t("invitationCreated"),
              )}>
              {t("sendInvitation")}
            </PrimaryButton>
            <p className="text-xs" style={{ color: C.muted }}>{t("inviteHint")}</p>
          </div>
        </div>
        <div className="rounded-lg p-3" style={{ background: C.surfaceAlt }}>
          <p className="text-xs font-bold mb-2" style={{ color: C.ink }}>{t("haveAnswers")}</p>
          <div className="flex flex-col gap-2">
            <textarea style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} rows={3}
              placeholder={t("csvPlaceholder", { code: inst.items[0]?.id ?? "SDQ1" })}
              value={csv} onChange={(e) => setCsv(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              <PrimaryButton small disabled={busy || !csv.trim() || !inst.items.length}
                onClick={() => run(
                  () => api.importCsv(patient.id, { instrumentId: inst.id, csv, respondentRole: role, wave: isWave && wave ? wave : undefined }),
                  (r) => `✓ ${r.imported} — ${(r.warnings as string[]).join("; ") || t("importOk")}`,
                )}>
                {t("importCsv")}
              </PrimaryButton>
              {canEnterManually && <GhostButton small onClick={() => onStartManualEntry(inst)}>{t("manualEntry")}</GhostButton>}
            </div>
            {!inst.items.length && (
              <p className="text-xs" style={{ color: C.amber }}>{t("itemsNotVerified")}</p>
            )}
          </div>
        </div>
      </div>
      {msg && <p className="text-xs mt-3" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </Card>
  );
}

function InvitationsPanel({ patient, instruments, onRefresh }: {
  patient: Patient;
  instruments: InstrumentDef[];
  onRefresh: (p: Patient) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!patient.invitations.length) return null;
  const label = (inv: InvitationRecord) => instruments.find((i) => i.id === inv.instrumentId)?.abbreviation ?? inv.instrumentId;
  const statusColor: Record<string, string> = { completed: C.spruce, error: C.danger, invited: C.blue, reminded: C.amber, created: C.muted };

  const doRemind = async (id: string) => {
    setBusy(true); setMsg(null);
    try { const r = await api.remindInvitation(id); onRefresh(r.patient); setMsg(t("reminderSent")); }
    catch (e) { setMsg(`✗ ${(e as Error).message}`); }
    finally { setBusy(false); }
  };
  const doSync = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.syncLimesurvey(patient.id);
      const p = await api.getPatient(patient.id);
      onRefresh(p.patient);
      setMsg(`✓ ${r.imported} / ${r.checked}${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}`);
    } catch (e) { setMsg(`✗ ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("invitationsTitle")}</h3>
        <GhostButton small onClick={doSync}>{busy ? t("working") : t("syncNow")}</GhostButton>
      </div>
      <div className="flex flex-col gap-2">
        {[...patient.invitations].reverse().map((inv) => (
          <div key={inv.id} className="flex items-center gap-3 flex-wrap rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
            <span className="text-sm font-semibold" style={{ color: C.ink }}>{label(inv)}</span>
            <ChannelChip channel={inv.channel} />
            <span className="text-xs" style={{ color: C.muted }}>{trRaterRole(inv.respondentRole, lang)}{inv.channel === "limesurvey" && inv.email ? ` · ${inv.email}` : ""}{inv.context.wave ? ` · ${inv.context.wave}` : ""}</span>
            <span className="text-xs font-bold" style={{ color: statusColor[inv.status] ?? C.muted }}>
              {trInvitationStatus(inv.status, lang)}{inv.sentAt ? ` · ${fmtDate(inv.sentAt)}` : ""}{inv.completedAt ? ` · ✓ ${fmtDate(inv.completedAt)}` : ""}
            </span>
            {inv.lastError && <span className="text-xs" style={{ color: C.danger }}>{inv.lastError}</span>}
            <span className="ml-auto flex gap-2">
              {(inv.status === "invited" || inv.status === "reminded") && (
                <GhostButton small onClick={() => doRemind(inv.id)}>{t("sendReminder")}</GhostButton>
              )}
            </span>
          </div>
        ))}
      </div>
      {msg && <p className="text-xs mt-3" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </Card>
  );
}

/// Coded intake predictors (docs/outcome-prediction.md §4.3): the classic ETR
/// set, entered by the clinician on the dossier — feeds nearest-neighbor /
/// dropout-risk prediction. Coded fields only, no free text.
function IntakePredictorsCard({ patient, readOnly, onRefresh }: {
  patient: Patient;
  readOnly: boolean;
  onRefresh: (p: Patient) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const cc = patient.caseCharacteristics;
  const [edit, setEdit] = useState<CaseCharacteristics>(cc);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(edit) !== JSON.stringify(cc);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.saveCaseCharacteristics(patient.id, edit);
      onRefresh(r.patient);
      setMsg(t("predictorsSaved"));
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const yesNo = (v: boolean | undefined, set: (b: boolean) => void) => (
    <div className="flex gap-1">
      {[true, false].map((b) => (
        <button key={String(b)} type="button" disabled={readOnly} onClick={() => set(b)} aria-pressed={v === b}
          className="rounded-md text-xs font-semibold px-3 py-1.5"
          style={{ background: v === b ? C.spruce : C.surfaceAlt, color: v === b ? "#fff" : C.muted, border: `1px solid ${v === b ? C.spruce : C.line}`, cursor: readOnly ? "default" : "pointer" }}>
          {b ? t("predYes") : t("predNo")}
        </button>
      ))}
    </div>
  );

  if (readOnly) {
    const rows: [string, string][] = [
      [t("durationLabel"), cc.problemDuration ? trProblemDuration(cc.problemDuration, lang) : t("notRecorded")],
      [t("priorTxLabel"), cc.priorPsychotherapy === undefined ? t("notRecorded") : cc.priorPsychotherapy ? t("predYes") : t("predNo")],
      [t("medicationLabel"), cc.psychotropicMedication === undefined ? t("notRecorded") : cc.psychotropicMedication ? t("predYes") : t("predNo")],
      [t("employmentLabel"), cc.employment ? trEmployment(cc.employment, lang) : t("notRecorded")],
      [t("expectationLabel"), cc.treatmentExpectation === undefined ? t("notRecorded") : String(cc.treatmentExpectation)],
    ];
    return (
      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("predictorsTitle")}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-2">
          {rows.map(([k, v]) => (<React.Fragment key={k}><dt style={{ color: C.muted }}>{k}</dt><dd className="font-semibold" style={{ color: C.ink }}>{v}</dd></React.Fragment>))}
        </dl>
      </Card>
    );
  }

  return (
    <Card className="p-5 mb-4">
      <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("predictorsTitle")}</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>{t("predictorsSub")}</p>
      <div className="flex gap-4 flex-wrap items-end">
        <Field label={t("durationLabel")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 160 }} value={edit.problemDuration ?? ""}
            onChange={(e) => setEdit({ ...edit, ...(e.target.value ? { problemDuration: e.target.value as CaseCharacteristics["problemDuration"] } : {}) })}>
            <option value="">{t("notRecorded")}</option>
            {PROBLEM_DURATIONS.map((d) => <option key={d} value={d}>{trProblemDuration(d, lang)}</option>)}
          </select>
        </Field>
        <Field label={t("employmentLabel")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 160 }} value={edit.employment ?? ""}
            onChange={(e) => setEdit({ ...edit, ...(e.target.value ? { employment: e.target.value as CaseCharacteristics["employment"] } : {}) })}>
            <option value="">{t("notRecorded")}</option>
            {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{trEmployment(s, lang)}</option>)}
          </select>
        </Field>
        <Field label={t("priorTxLabel")}>
          {yesNo(edit.priorPsychotherapy, (b) => setEdit({ ...edit, priorPsychotherapy: b }))}
        </Field>
        <Field label={t("medicationLabel")}>
          {yesNo(edit.psychotropicMedication, (b) => setEdit({ ...edit, psychotropicMedication: b }))}
        </Field>
        <Field label={t("expectationLabel")}>
          <input type="number" min={0} max={10} step={1} style={{ ...inputStyle, width: 90 }}
            value={edit.treatmentExpectation ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                const { treatmentExpectation: _drop, ...rest } = edit;
                setEdit(rest);
              } else {
                setEdit({ ...edit, treatmentExpectation: Math.max(0, Math.min(10, Math.round(Number(raw)))) });
              }
            }} />
        </Field>
        <PrimaryButton small disabled={busy || !dirty} onClick={save}>{t("savePredictors")}</PrimaryButton>
      </div>
      {msg && <p className="text-xs mt-2" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </Card>
  );
}

/// Session-attendance log (§4.5): sessions without questionnaires, cancellations
/// and no-shows — the "session without questionnaire" quick action.
function SessionLogPanel({ patient, therapists, user, onRefresh }: {
  patient: Patient;
  therapists: Therapist[];
  user: SessionUser;
  onRefresh: (p: Patient) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [type, setType] = useState<string>("held");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [conductedById, setConductedById] = useState<string>(user.role === "therapist" ? user.id : patient.therapistId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.logSession(patient.id, {
        occurredAt: `${date}T12:00:00`,
        type,
        conductedById: conductedById || null,
        note: note.trim() || undefined,
      });
      onRefresh(r.patient);
      setNote("");
      setMsg(t("logSaved"));
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async (logId: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.deleteSessionLog(logId);
      onRefresh(r.patient);
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 mb-4">
      <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("sessionLogTitle")}</h3>
      <p className="text-xs mb-3" style={{ color: C.muted }}>{t("sessionLogSub")}</p>
      <div className="flex gap-3 flex-wrap items-end">
        <Field label={t("logDateLabel")}>
          <input type="date" style={{ ...inputStyle, width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("logTypeLabel")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 200 }} value={type} onChange={(e) => setType(e.target.value)}>
            {SESSION_LOG_TYPES.map((v) => <option key={v} value={v}>{trSessionLogType(v, lang)}</option>)}
          </select>
        </Field>
        <Field label={t("conductedBy")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 180 }} value={conductedById} onChange={(e) => setConductedById(e.target.value)}>
            <option value="">—</option>
            {therapists.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
          </select>
        </Field>
        <Field label={t("logNoteLabel")}>
          <input style={{ ...inputStyle, width: 220 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <PrimaryButton small disabled={busy} onClick={save}>{t("logSave")}</PrimaryButton>
      </div>
      {patient.sessionLogs.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("logEntries")}</p>
          <div className="flex flex-col gap-1">
            {[...patient.sessionLogs].reverse().map((l) => {
              const by = therapists.find((th) => th.id === l.conductedById);
              return (
                <div key={l.id} className="flex items-center gap-3 flex-wrap rounded-lg px-3 py-1.5 text-xs" style={{ background: C.surfaceAlt }}>
                  <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtDate(l.occurredAt)}</span>
                  <span className="font-semibold" style={{ color: l.type === "held" ? C.spruce : C.amber }}>{trSessionLogType(l.type, lang)}</span>
                  {by && <span style={{ color: C.muted }}>{t("conductedBy")}: {by.name}</span>}
                  {l.note && <span style={{ color: C.muted }}>“{l.note}”</span>}
                  <button type="button" className="ml-auto font-semibold" onClick={() => doDelete(l.id)}
                    style={{ color: C.danger, background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>
                    {t("logDelete")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {msg && <p className="text-xs mt-2" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </Card>
  );
}

export function PatientDetail({ patient, user, therapists, instruments, onBack, onAssign, onSaveDiagnosis, onResend, onPatientUpdated, onStartDips, onOpenDiagnosis }: {
  patient: Patient; user: SessionUser; therapists: Therapist[]; instruments: InstrumentDef[];
  onBack: () => void; onAssign: (id: string, therapistId: string | null) => void;
  onSaveDiagnosis: (id: string, text: string, category: string, icdCode?: string) => void; onResend: (id: string) => void;
  onPatientUpdated: (p: Patient) => void;
  onStartDips: (id: string) => void;
  onOpenDiagnosis: (id: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const therapist = therapists.find((th) => th.id === patient.therapistId);
  const [dxText, setDxText] = useState("");
  const [dxCategory, setDxCategory] = useState<string>("other");
  const [dxIcd, setDxIcd] = useState("");
  // Mechanical diagnosis proposal from the therapist-administered DIPS —
  // pre-fills the (still editable) diagnosis form; never auto-saved.
  const proposal = useMemo(() => (patient.dips ? primaryProposal(patient.dips.answers) : null), [patient.dips]);
  useEffect(() => {
    if (!proposal || patient.diagnosis) return;
    setDxText((prev) => (prev.trim() ? prev : proposal.suggestedText));
    setDxIcd((prev) => (prev.trim() ? prev : proposal.icdCode));
    setDxCategory((prev) => (prev !== "other" ? prev : proposal.disorderCategory));
  }, [proposal, patient.diagnosis]);
  const [manualEntry, setManualEntry] = useState<InstrumentDef | null>(null);
  const [busy, setBusy] = useState(false);
  // Therapist-facing outcome prediction (docs/outcome-prediction.md) — fetched
  // for active therapy dossiers; the API rejects unassigned therapists (403),
  // in which case the panel simply stays hidden.
  const [prediction, setPrediction] = useState<PredictionPayload | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [bandSource, setBandSource] = useState<BandSource>("clinic");
  // Conclude-treatment (archive) state — see the card at the bottom of the page.
  const [archOutcome, setArchOutcome] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archMsg, setArchMsg] = useState<string | null>(null);
  const lastProgress = latestSessionScore(patient);
  const d = patient.demographics;
  const demoRows: [string, React.ReactNode][] = [
    [tr(T.age, lang), d.age], [tr(T.sex, lang), trDemoValue(d.sex, lang)], [tr(T.nationality, lang), d.nationality],
    [tr(T.city, lang), d.city], [tr(T.occupation, lang), d.occupation], [tr(T.living, lang), trDemoValue(d.living, lang)],
  ];
  const sub = patient.dips && patient.dips.submission;
  const alerts = activeAlerts(patient, instruments);
  const isArchived = patient.status === "archived";
  const canArchive = user.role === "director" || (user.role === "therapist" && patient.therapistId === user.id);
  const showPrediction = patient.status === "therapy";

  useEffect(() => {
    if (!showPrediction) {
      setPrediction(null);
      return;
    }
    let cancelled = false;
    setPredictionLoading(true);
    api
      .getPrediction(patient.id)
      .then((r) => {
        if (!cancelled) setPrediction(r.prediction);
      })
      .catch(() => {
        if (!cancelled) setPrediction(null);
      })
      .finally(() => {
        if (!cancelled) setPredictionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patient.id, patient.responses.length, showPrediction]);

  /// Chart overlay (band/boundary/ETR/diamonds) for one instrument, driven by
  /// the panel's source toggle.
  const chartPredictionFor = (instrumentId: string): ChartPrediction | undefined => {
    if (!prediction) return undefined;
    const s = prediction.series.find((x) => x.instrumentId === instrumentId);
    if (!s) return undefined;
    const simulated = prediction.reference.includesSimulated;
    const band =
      bandSource === "clinic"
        ? {
            points: s.expectedCourse.points,
            label:
              t("bandLabelClinic", { n: s.expectedCourse.cases }) +
              (s.expectedCourse.stratified ? ` · ${t("bandStratified")}` : ""),
            simulated,
          }
        : bandSource === "nn" && s.nn.available && s.nn.points
          ? { points: s.nn.points, label: t("bandLabelNn", { k: s.nn.k ?? 0 }), simulated }
          : null;
    // The NOT flag fires on the 80% tolerance boundary (p10/p90) — draw that
    // same line the flag actually uses, direction-aware per scale.
    const hib =
      instruments.find((i) => i.id === instrumentId)?.scales.find((k) => k.key === s.scaleKey)?.higherIsBetter ?? true;
    const clinicBoundary = s.expectedCourse.points.map((p) => ({
      session: p.session,
      value: hib ? p.p10 : p.p90,
    }));
    return {
      scaleKey: s.scaleKey,
      band,
      failureBoundary:
        bandSource === "nn" && s.nn.available
          ? s.nn.failureBoundary
          : bandSource === "clinic"
            ? clinicBoundary
            : undefined,
      etrPoints: bandSource === "etr" && s.etr.available ? s.etr.points : undefined,
      shifts: s.suddenShifts,
    };
  };

  /// The amber not-on-track signal (Stage 1 item 4) — distinct from the red
  /// safety alerts; red stays reserved for safety.
  const notOnTrackSeries = (prediction?.series ?? []).filter((s) => s.onTrack.status === "not_on_track");

  const doArchive = async () => {
    setBusy(true);
    setArchMsg(null);
    try {
      const r = await api.archivePatient(patient.id, archOutcome);
      onPatientUpdated(r.patient);
      setConfirmArchive(false);
      if (r.archiveExport && !r.archiveExport.ok)
        setArchMsg(t("archiveExportFailed", { error: r.archiveExport.error ?? "" }));
    } catch (e) {
      setArchMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const doUnarchive = async () => {
    setBusy(true);
    setArchMsg(null);
    try {
      const r = await api.unarchivePatient(patient.id);
      onPatientUpdated(r.patient);
    } catch (e) {
      setArchMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const instrumentsWithData = instruments
    .filter((i) => i.id !== DIPS_INSTRUMENT_ID)
    .map((i) => ({ instrument: i, responses: responsesFor(patient, i.id) }))
    .filter((x) => x.responses.length > 0)
    .sort((a, b) => b.responses.length - a.responses.length);
  const notes = patient.responses.filter((r) => r.note);

  if (manualEntry) {
    return (
      <InstrumentForm
        instrument={manualEntry}
        clinicianMode
        therapists={therapists}
        defaultConductedById={user.role === "therapist" ? user.id : patient.therapistId}
        busy={busy}
        onCancel={() => setManualEntry(null)}
        onSubmit={async (payload) => {
          setBusy(true);
          try {
            const r = await api.submitResponse(patient.id, payload);
            onPatientUpdated(r.patient);
            setManualEntry(null);
            if (r.skippedScales.length) alert(`${t("scalesNotComputed")}\n${r.skippedScales.map((s) => `${s.key}: ${s.reason}`).join("\n")}`);
          } catch (e) {
            alert("✗ " + (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3" style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>{t("backToOverview")}</button>

      {alerts.map((a) => (
        <Card key={`${a.instrumentId}:${a.scaleKey}`} className="p-4 mb-4" style={{ background: "#F7E9E6", border: `1px solid ${C.danger}` }}>
          <p className="text-sm font-bold" style={{ color: C.danger }}>⚠ {t("clinicalAlert")} — {a.instrumentAbbr}</p>
          <p className="text-sm mt-1" style={{ color: C.ink }}>
            {a.message} ({a.scaleLabel} = {a.value}, {fmtDate(a.occurredAt)})
          </p>
        </Card>
      ))}

      {/* Amber "not on track" banner — decision support, NOT a safety alarm. */}
      {notOnTrackSeries.length > 0 && (
        <Card className="p-4 mb-4" style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
          <p className="text-sm font-bold" style={{ color: C.amber }}>⚑ {t("notOnTrackBanner")}</p>
          <p className="text-sm mt-1" style={{ color: C.ink }}>
            {notOnTrackSeries
              .map(
                (s) =>
                  `${s.instrumentId === "phq4" ? "PHQ-4" : "PSTB"}: ${s.onTrack.reasons
                    .map((r) => (r === "below_band" ? t("notReasonBand") : t("notReasonRci")))
                    .join(" + ")}`,
              )
              .join(" · ")}
          </p>
          <p className="text-xs mt-1" style={{ color: C.muted }}>{t("notOnTrackHint")}</p>
        </Card>
      )}

      {isArchived && (
        <Card className="p-4 mb-4" style={{ background: C.surfaceAlt }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold" style={{ color: C.ink }}>
                {t("archivedOn", { date: patient.archivedAt ? fmtDate(patient.archivedAt) : "—" })}
                {patient.archivedBy ? ` ${t("archivedByLine", { name: patient.archivedBy })}` : ""}
              </p>
              {patient.terminationReason && (
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                  {t("terminationLabel")}: {trTerminationReason(patient.terminationReason, lang)}
                </p>
              )}
            </div>
            {canArchive && (
              <span className="ml-auto"><GhostButton small onClick={doUnarchive}>{t("reopenTreatment")}</GhostButton></span>
            )}
          </div>
          {archMsg && <p className="text-xs mt-2" style={{ color: C.amber }}>{archMsg}</p>}
        </Card>
      )}

      <Card className="p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="rounded-full" style={{ width: 14, height: 14, background: patient.color }} />
            <div>
              <h2 className="lc-display text-2xl" style={{ color: C.ink }}>{patient.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge status={patient.status} />
                {patient.disorderCategory && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.blueSoft, color: C.blue }}>
                    {trCategory(patient.disorderCategory, lang)}
                  </span>
                )}
                <span className="text-xs" style={{ color: C.muted }}>
                  {patient.responses.length > 0 ? `${patient.responses.length} ${t("questionnairesOnFile")}` : t("noQuestionnairesYet")}
                  {patient.email ? ` · ${patient.email}` : ""}
                  {patient.code ? ` · ${t("patientCodeLabel")}: ${patient.code}` : ""}
                </span>
              </div>
            </div>
          </div>
          {lastProgress !== null && (
            <div className="text-right">
              <div className="text-3xl font-bold" style={{ color: C.spruce, fontVariantNumeric: "tabular-nums" }}>{fmtScore(lastProgress)} <TrendArrow patient={patient} /></div>
              <div className="text-xs" style={{ color: C.muted }}>{t("latestProgress")}</div>
            </div>
          )}
        </div>
        {instrumentsWithData.length > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
            <p className="text-xs font-bold mb-1" style={{ color: C.spruce }}>{t("summaryTitle")}</p>
            <p className="text-xs mb-2" style={{ color: C.muted }}>{t("summarySub")}</p>
            <SummaryStrip patient={patient} instruments={instruments.filter((i) => i.id !== DIPS_INSTRUMENT_ID)} />
          </div>
        )}
        <div className="mt-4 pt-4 flex items-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${C.line}` }}>
          <span className="text-sm font-semibold" style={{ color: C.ink }}>{t("therapistLabel")}</span>
          {user.role === "director" ? (
            <select style={{ ...inputStyle, width: "auto", minWidth: 200 }} value={patient.therapistId || ""} onChange={(e) => onAssign(patient.id, e.target.value || null)}>
              <option value="">{t("unassigned")}</option>
              {therapists.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
            </select>
          ) : (
            <span className="text-sm" style={{ color: C.muted }}>{therapist ? therapist.name : t("unassigned")}</span>
          )}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("demographicsTitle")}</h3>
          {d && Object.keys(d).length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {demoRows.map(([k, v]) => (<React.Fragment key={String(k)}><dt style={{ color: C.muted }}>{k}</dt><dd className="font-semibold" style={{ color: C.ink }}>{v || "—"}</dd></React.Fragment>))}
            </dl>
          ) : (<p className="text-sm" style={{ color: C.muted }}>{t("noIntakeYet")}</p>)}
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("diagnosisTitle")}</h3>
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
              <p className="text-xs mt-1" style={{ color: C.muted }}>{t("recordedOn")} {fmtDate(patient.diagnosis.date)} · {patient.diagnosis.by}</p>
              {patient.dips && (
                <div className="mt-2">
                  <GhostButton small onClick={() => onOpenDiagnosis(patient.id)}>{t("openDiagnosisView")}</GhostButton>
                </div>
              )}
            </div>
          ) : isArchived ? (
            <p className="text-sm" style={{ color: C.muted }}>—</p>
          ) : patient.status === "assessment" ? (
            <p className="text-sm" style={{ color: C.muted }}>{t("diagnosisAfterIntake")}</p>
          ) : !patient.dips ? (
            // Gate: the DIPS interview is required before a diagnosis can be recorded.
            <div>
              <p className="text-sm mb-3" style={{ color: C.muted }}>{t("dipsRequired")}</p>
              <PrimaryButton small onClick={() => onStartDips(patient.id)}>{t("startDipsInterview")}</PrimaryButton>
            </div>
          ) : (
            <div>
              {proposal ? (
                <p className="mb-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>{t("proposalChip")}</span>
                </p>
              ) : (
                <p className="text-sm mb-2" style={{ color: C.muted }}>{t("noProposal")}</p>
              )}
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} placeholder={t("diagnosisPlaceholder")} value={dxText} onChange={(e) => setDxText(e.target.value)} />
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Field label={t("disorderCategoryLabel")}>
                  <select style={{ ...inputStyle, width: "auto", minWidth: 170 }} value={dxCategory} onChange={(e) => setDxCategory(e.target.value)}>
                    {DISORDER_CATEGORIES.map((c) => <option key={c} value={c}>{trCategory(c, lang)}</option>)}
                  </select>
                </Field>
                <Field label={t("icdLabel")}>
                  <input style={{ ...inputStyle, width: 110 }} placeholder="F41.0" value={dxIcd} onChange={(e) => setDxIcd(e.target.value.toUpperCase())} />
                </Field>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <PrimaryButton small disabled={!dxText.trim()} onClick={() => onSaveDiagnosis(patient.id, dxText.trim(), dxCategory, dxIcd.trim() || undefined)}>{t("saveDiagnosis")}</PrimaryButton>
                <GhostButton small onClick={() => onOpenDiagnosis(patient.id)}>{t("openDiagnosisView")}</GhostButton>
              </div>
            </div>
          )}
        </Card>
      </div>

      <DocumentsPanel patient={patient} user={user} onRefresh={onPatientUpdated} />

      {/* Therapist-facing outcome prediction — active therapy dossiers only. */}
      {showPrediction && (
        <PredictionPanel prediction={prediction} loading={predictionLoading} source={bandSource} onSourceChange={setBandSource} />
      )}

      {/* Intake predictors (§4.3) — read-only on archived dossiers. */}
      <IntakePredictorsCard patient={patient} readOnly={isArchived} onRefresh={onPatientUpdated} />

      {patient.dips && (
        <Card className="p-5 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("dipsTitle")}</h3>
            {sub && sub.status !== "sent" && <GhostButton small onClick={() => onResend(patient.id)}>{tr(T.retry, lang)}</GhostButton>}
          </div>
          <DipsSummary patient={patient} />
        </Card>
      )}

      {/* Archived dossiers are read-only — no new data collection. */}
      {!isArchived && <AddDataPanel patient={patient} instruments={instruments} onStartManualEntry={setManualEntry} onRefresh={onPatientUpdated} />}
      {!isArchived && <SessionLogPanel patient={patient} therapists={therapists} user={user} onRefresh={onPatientUpdated} />}
      <InvitationsPanel patient={patient} instruments={instruments} onRefresh={onPatientUpdated} />

      {instrumentsWithData.length === 0 && (
        <Card className="p-5 mb-4"><p className="text-sm" style={{ color: C.muted }}>{t("noDataYet")}</p></Card>
      )}
      {instrumentsWithData.map(({ instrument, responses }) => (
        <InstrumentCard key={instrument.id} instrument={instrument} responses={responses} therapists={therapists} chartPrediction={chartPredictionFor(instrument.id)} />
      ))}

      {notes.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("notesTitle")}</h3>
          <div className="flex flex-col gap-2">
            {[...notes].reverse().map((r) => (
              <div key={r.id} className="rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                <p className="text-xs font-bold" style={{ color: C.muted }}>{r.sessionNumber !== null ? `${t("sessionN")} ${r.sessionNumber}` : ""} · {fmtDate(r.occurredAt)}</p>
                <p className="text-sm mt-0.5" style={{ color: C.ink }}>{r.note}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Conclude treatment & archive — deliberately the last, low-key card. */}
      {canArchive && !isArchived && (
        <Card className="p-5 mt-4">
          <h3 className="text-sm font-bold mb-1" style={{ color: C.ink }}>{t("concludeTitle")}</h3>
          <p className="text-xs mb-3" style={{ color: C.muted }}>{t("concludeSub")}</p>
          <div className="flex items-end gap-3 flex-wrap">
            <Field label={t("terminationLabel")}>
              <select style={{ ...inputStyle, width: "auto", minWidth: 240 }} value={archOutcome} onChange={(e) => setArchOutcome(e.target.value)}>
                <option value="">{t("terminationNone")}</option>
                {TERMINATION_REASONS.map((r) => (
                  <option key={r} value={r}>{trTerminationReason(r, lang)}</option>
                ))}
              </select>
            </Field>
            {confirmArchive ? (
              <>
                <button type="button" onClick={doArchive} disabled={busy || !archOutcome} className="text-xs font-bold px-3 py-2 rounded-lg"
                  style={{ background: C.danger, color: "#fff", border: "none", cursor: busy ? "wait" : "pointer", opacity: archOutcome ? 1 : 0.5 }}>
                  {t("archiveConfirm")}
                </button>
                <GhostButton small onClick={() => setConfirmArchive(false)}>{t("cancel")}</GhostButton>
              </>
            ) : (
              <GhostButton small disabled={!archOutcome} onClick={() => setConfirmArchive(true)}>{t("concludeTitle")}</GhostButton>
            )}
          </div>
          {archMsg && <p className="text-xs mt-2" style={{ color: C.danger }}>{archMsg}</p>}
        </Card>
      )}
    </div>
  );
}
