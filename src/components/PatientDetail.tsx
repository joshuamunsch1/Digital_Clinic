"use client";
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { tr, T, trCategory } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { api } from "@/lib/api-client";
import type { InstrumentDef } from "@/lib/instruments/types";
import { isScoreable } from "@/lib/instruments/types";
import type { InvitationRecord, Patient, ResponseRecord, SessionUser, Therapist } from "@/lib/types";
import { DIPS_INSTRUMENT_ID, DISORDER_CATEGORIES, activeAlerts, fmtScore, latestSessionScore, responsesFor } from "@/lib/types";
import { Card, Field, GhostButton, PrimaryButton, StatusBadge, TrendArrow, inputStyle } from "./ui";
import { ScoreTable, SummaryStrip, TrajectoryChart, occasionOf } from "./charts";
import { DipsSummary } from "./DipsSummary";
import { DocumentsPanel } from "./DocumentsPanel";
import { ChannelChip } from "./MonitoringView";
import { InstrumentForm } from "./InstrumentForm";
import { useLang, useT } from "./LangContext";

function DefinitionBadge({ instrument }: { instrument: InstrumentDef }) {
  const t = useT();
  if (instrument.definitionStatus === "complete") return null;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}
      title="Item/scale detail was not fully verified from the legacy system — see docs/instrument-catalog.json.">
      {t("definitionBadge", { status: instrument.definitionStatus.replace("_", " ") })}
    </span>
  );
}

/// One individual filled-out questionnaire, expandable to its raw answers.
function ResponseRow({ instrument, response }: { instrument: InstrumentDef; response: ResponseRecord }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const occ = occasionOf(instrument, response);
  return (
    <div className="rounded-lg" style={{ background: C.surfaceAlt }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left px-3 py-2 flex items-center gap-3 flex-wrap" style={{ background: "none", border: "none", cursor: "pointer" }}>
        <span className="text-xs font-bold" style={{ color: C.ink }}>{occ.label}</span>
        <span className="text-xs" style={{ color: C.muted }}>{fmtDate(response.occurredAt)} · {response.respondentRole} · {t("via")} {response.source.replace("_", " ")}</span>
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

function InstrumentCard({ instrument, responses }: { instrument: InstrumentDef; responses: ResponseRecord[] }) {
  const t = useT();
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
        {instrument.raterRole} · {instrument.cadenceType.replace("_", " ")} · {instrument.population.replace(/_/g, " ")}
      </p>
      {scoreable && occasions >= 2 && (
        <div className="mb-3"><TrajectoryChart instrument={instrument} responses={responses} /></div>
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
          {list.map((r) => <ResponseRow key={r.id} instrument={instrument} response={r} />)}
        </div>
      )}
    </Card>
  );
}

const RATER_ROLES = ["self", "mother", "father", "parent", "teacher", "caregiver", "clinician"];

/// Get data in: send a LimeSurvey link, upload a LimeSurvey CSV export, or type
/// a paper form in manually. See docs/limesurvey-integration.md.
function AddDataPanel({ patient, instruments, onStartManualEntry, onRefresh }: {
  patient: Patient;
  instruments: InstrumentDef[];
  onStartManualEntry: (inst: InstrumentDef) => void;
  onRefresh: (p: Patient) => void;
}) {
  const t = useT();
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
                {i.abbreviation} — {i.raterRole} ({i.population.replace(/_/g, " ")})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("ratedBy")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 120 }} value={role} onChange={(e) => setRole(e.target.value)}>
            {RATER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
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
                  (r) => `✓ ${r.imported} — ${(r.warnings as string[]).join("; ") || "OK"}`,
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
            <span className="text-xs" style={{ color: C.muted }}>{inv.respondentRole}{inv.channel === "limesurvey" && inv.email ? ` · ${inv.email}` : ""}{inv.context.wave ? ` · ${inv.context.wave}` : ""}</span>
            <span className="text-xs font-bold" style={{ color: statusColor[inv.status] ?? C.muted }}>
              {inv.status}{inv.sentAt ? ` · ${fmtDate(inv.sentAt)}` : ""}{inv.completedAt ? ` · ✓ ${fmtDate(inv.completedAt)}` : ""}
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

export function PatientDetail({ patient, user, therapists, instruments, onBack, onAssign, onSaveDiagnosis, onResend, onPatientUpdated }: {
  patient: Patient; user: SessionUser; therapists: Therapist[]; instruments: InstrumentDef[];
  onBack: () => void; onAssign: (id: string, therapistId: string | null) => void;
  onSaveDiagnosis: (id: string, text: string, category: string) => void; onResend: (id: string) => void;
  onPatientUpdated: (p: Patient) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const therapist = therapists.find((th) => th.id === patient.therapistId);
  const [dxText, setDxText] = useState("");
  const [dxCategory, setDxCategory] = useState<string>("other");
  const [manualEntry, setManualEntry] = useState<InstrumentDef | null>(null);
  const [busy, setBusy] = useState(false);
  const lastProgress = latestSessionScore(patient);
  const d = patient.demographics;
  const demoRows: [string, React.ReactNode][] = [
    [tr(T.age, lang), d.age], [tr(T.sex, lang), d.sex], [tr(T.nationality, lang), d.nationality],
    [tr(T.city, lang), d.city], [tr(T.occupation, lang), d.occupation], [tr(T.living, lang), d.living],
  ];
  const sub = patient.dips && patient.dips.submission;
  const alerts = activeAlerts(patient, instruments);

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
        busy={busy}
        onCancel={() => setManualEntry(null)}
        onSubmit={async (payload) => {
          setBusy(true);
          try {
            const r = await api.submitResponse(patient.id, payload);
            onPatientUpdated(r.patient);
            setManualEntry(null);
            if (r.skippedScales.length) alert(`Saved, but some scales were not computed:\n${r.skippedScales.map((s) => `${s.key}: ${s.reason}`).join("\n")}`);
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
            <div><p className="text-sm font-semibold" style={{ color: C.ink }}>{patient.diagnosis.text}</p><p className="text-xs mt-1" style={{ color: C.muted }}>{t("recordedOn")} {fmtDate(patient.diagnosis.date)} · {patient.diagnosis.by}</p></div>
          ) : patient.status === "assessment" ? (
            <p className="text-sm" style={{ color: C.muted }}>{t("diagnosisAfterIntake")}</p>
          ) : (
            <div>
              <p className="text-sm mb-2" style={{ color: C.muted }}>{t("diagnosisPrompt")}</p>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} placeholder={t("diagnosisPlaceholder")} value={dxText} onChange={(e) => setDxText(e.target.value)} />
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Field label={t("disorderCategoryLabel")}>
                  <select style={{ ...inputStyle, width: "auto", minWidth: 170 }} value={dxCategory} onChange={(e) => setDxCategory(e.target.value)}>
                    {DISORDER_CATEGORIES.map((c) => <option key={c} value={c}>{trCategory(c, lang)}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-2"><PrimaryButton small disabled={!dxText.trim()} onClick={() => onSaveDiagnosis(patient.id, dxText.trim(), dxCategory)}>{t("saveDiagnosis")}</PrimaryButton></div>
            </div>
          )}
        </Card>
      </div>

      <DocumentsPanel patient={patient} user={user} onRefresh={onPatientUpdated} />

      {patient.dips && (
        <Card className="p-5 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("dipsTitle")}</h3>
            {sub && sub.status !== "sent" && <GhostButton small onClick={() => onResend(patient.id)}>{tr(T.retry, lang)}</GhostButton>}
          </div>
          <DipsSummary patient={patient} />
        </Card>
      )}

      <AddDataPanel patient={patient} instruments={instruments} onStartManualEntry={setManualEntry} onRefresh={onPatientUpdated} />
      <InvitationsPanel patient={patient} instruments={instruments} onRefresh={onPatientUpdated} />

      {instrumentsWithData.length === 0 && (
        <Card className="p-5 mb-4"><p className="text-sm" style={{ color: C.muted }}>{t("noDataYet")}</p></Card>
      )}
      {instrumentsWithData.map(({ instrument, responses }) => (
        <InstrumentCard key={instrument.id} instrument={instrument} responses={responses} />
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
    </div>
  );
}
