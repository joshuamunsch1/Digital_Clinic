"use client";
// The unified "Sitzungen & Fragebögen" panel (Batch 12): ONE per-patient
// surface for the session ledger and questionnaire monitoring, shared by the
// dossier (variant "dossier": collapsible card) and MonitoringView (variant
// "monitoring": bare, always expanded). Logging a HELD session chains into a
// pre-filled send step for the every-session instruments; the ledger shows
// per-session measurement status via the invitation→sessionLog FK plus
// responses matched by sessionNumber (manual/CSV entries).
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { api } from "@/lib/api-client";
import { trInvitationStatus, trRaterRole, trSessionLogType } from "@/lib/i18n";
import type { InvitationRecord, Patient, SessionLogRecord, SessionUser, Therapist } from "@/lib/types";
import { DIPS_INSTRUMENT_ID, SESSION_LOG_TYPES } from "@/lib/types";
import type { InstrumentDef } from "@/lib/instruments/types";
import { isOpenInvitation, isOverdue } from "@/lib/reminders";
import { suggestNextSessionNumber } from "@/lib/session-numbers";
import { recommendedInstrumentIds } from "@/lib/recommendations";
import { patientFillable, populationMatches } from "./PatientHome";
import { Card, Field, GhostButton, PrimaryButton, inputStyle } from "./ui";
import { useLang, useT } from "./LangContext";

const statusColor: Record<string, string> = {
  completed: C.spruce,
  error: C.danger,
  invited: C.blue,
  reminded: C.amber,
  created: C.muted,
  cancelled: C.muted,
  no_response: C.muted,
};

export function ChannelChip({ channel }: { channel: string }) {
  const t = useT();
  const inApp = channel === "in_app";
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: inApp ? C.spruceSoft : C.blueSoft, color: inApp ? C.spruce : C.blue }}>
      {inApp ? t("channelInApp") : "LimeSurvey"}
    </span>
  );
}

/// Inline editor for an invitation's automatic reminder schedule.
function ScheduleEditor({ inv, onSave }: {
  inv: InvitationRecord;
  onSave: (days: number | null, max: number | null) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(inv.remindEveryDays ?? 7);
  const [max, setMax] = useState(inv.maxReminders ?? 3);

  if (!editing) {
    return (
      <span className="text-xs flex items-center gap-1 flex-wrap" style={{ color: C.muted }}>
        {inv.remindEveryDays ? (
          <>
            {t("schedText", { days: inv.remindEveryDays })}
            {inv.reminderCount > 0 && <> · {t("schedSent", { n: inv.reminderCount })}{inv.maxReminders ? `/${inv.maxReminders}` : ""}</>}
            {inv.nextReminderAt && <> · {t("schedNext", { date: fmtDate(inv.nextReminderAt) })}</>}
          </>
        ) : (
          t("schedNone")
        )}
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold"
          style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {inv.remindEveryDays ? "✎" : t("setSchedule")}
        </button>
      </span>
    );
  }
  return (
    <span className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: C.muted }}>
      <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))}
        style={{ ...inputStyle, width: 58, padding: "3px 6px", fontSize: 12 }} />
      {t("daysShort")} ·
      <input type="number" min={1} value={max} onChange={(e) => setMax(Number(e.target.value))}
        style={{ ...inputStyle, width: 50, padding: "3px 6px", fontSize: 12 }} />
      {t("maxRemindersLabel")}
      <GhostButton small onClick={() => { onSave(Number.isInteger(days) && days > 0 ? days : null, Number.isInteger(max) && max > 0 ? max : null); setEditing(false); }}>
        {t("saveBtn")}
      </GhostButton>
      {inv.remindEveryDays != null && (
        <GhostButton small onClick={() => { onSave(null, null); setEditing(false); }}>{t("clearSchedule")}</GhostButton>
      )}
      <GhostButton small onClick={() => setEditing(false)}>{t("cancel")}</GhostButton>
    </span>
  );
}

/// Ad-hoc questionnaire collection for one patient: LimeSurvey e-mail
/// invitation, in-app task, manual paper-form entry (full-window clinician
/// form) or LimeSurvey CSV import.
type CollectMode = "limesurvey" | "in_app" | "manual" | "csv";

function NewRequestForm({ patient, instruments, configured, onDone, onStartManualEntry }: {
  patient: Patient;
  instruments: InstrumentDef[];
  configured: boolean;
  onDone: (p: Patient, message: string) => void;
  onStartManualEntry: (inst: InstrumentDef) => void;
}) {
  const t = useT();
  // Diagnosis-/category-specific recommendations: sorted first + starred.
  const recIds = useMemo(() => recommendedInstrumentIds(patient, instruments), [patient, instruments]);
  const candidates = useMemo(
    () =>
      instruments
        .filter((i) => i.id !== DIPS_INSTRUMENT_ID && i.instrumentType === "likert_battery")
        .sort((a, b) => Number(recIds.has(b.id)) - Number(recIds.has(a.id))),
    [instruments, recIds],
  );
  const fillableIds = useMemo(
    () => new Set(patientFillable(instruments, patient).map((i) => i.id)),
    [instruments, patient],
  );
  const [instId, setInstId] = useState(candidates[0]?.id ?? "");
  const inst = candidates.find((i) => i.id === instId);
  const inAppPossible = fillableIds.has(instId);
  const hasItems = (inst?.items.length ?? 0) > 0;
  const canManual = hasItems && inst?.definitionStatus === "complete";
  const [mode, setMode] = useState<CollectMode>(configured ? "limesurvey" : "in_app");
  const [role, setRole] = useState("self");
  const [wave, setWave] = useState("");
  const [email, setEmail] = useState(patient.email ?? "");
  const [surveyId, setSurveyId] = useState("");
  const [remindDays, setRemindDays] = useState("");
  const [maxRem, setMaxRem] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!inst) return null;
  const modes: { key: CollectMode; label: string; enabled: boolean }[] = [
    { key: "limesurvey", label: "LimeSurvey", enabled: configured },
    { key: "in_app", label: t("channelInApp"), enabled: inAppPossible },
    { key: "manual", label: t("manualEntry"), enabled: canManual },
    { key: "csv", label: t("importCsv"), enabled: hasItems },
  ];
  const effectiveMode = modes.find((m) => m.key === mode)?.enabled
    ? mode
    : (modes.find((m) => m.enabled)?.key ?? "limesurvey");
  const errText = (m: string) =>
    m === "network_restricted" ? t("networkRestricted") : m === "email_taken" ? t("emailTaken") : m;
  const isWave = inst.cadenceType === "wave";
  const waves = inst.cadenceConfig.waves ?? ["pre", "zm", "post", "postF"];
  const canSend =
    effectiveMode === "in_app"
      ? inAppPossible
      : configured && !!email.trim() && (!!surveyId.trim() || !!inst.limesurveySurveyId);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const days = Number(remindDays);
      const max = Number(maxRem);
      const r = await api.createInvitation(patient.id, {
        instrumentId: inst.id,
        channel: effectiveMode === "in_app" ? "in_app" : "limesurvey",
        respondentRole: effectiveMode === "in_app" ? "self" : role,
        // Editable for both channels; a changed address updates the patient record.
        email: email.trim() || undefined,
        wave: isWave && wave ? wave : undefined,
        surveyId: effectiveMode === "limesurvey" ? surveyId.trim() || undefined : undefined,
        remindEveryDays: Number.isInteger(days) && days > 0 ? days : undefined,
        maxReminders: Number.isInteger(max) && max > 0 ? max : undefined,
      });
      onDone(
        r.patient,
        `${effectiveMode === "in_app" ? t("taskCreated") : t("invitationCreated")}${r.warning ? ` ⚠ ${r.warning}` : ""}`,
      );
    } catch (e) {
      setErr(`✗ ${errText((e as Error).message)}`);
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.importCsv(patient.id, {
        instrumentId: inst.id,
        csv,
        respondentRole: role,
        wave: isWave && wave ? wave : undefined,
      });
      setCsv("");
      onDone(r.patient, `✓ ${r.imported} — ${r.warnings.join("; ") || t("importOk")}`);
    } catch (e) {
      setErr(`✗ ${errText((e as Error).message)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg p-3 mt-2" style={{ background: C.surfaceAlt }}>
      <div className="flex items-end gap-2 flex-wrap">
        <Field label={t("instrumentLabel")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 230 }} value={instId}
            onChange={(e) => { setInstId(e.target.value); setSurveyId(""); setErr(null); }}>
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>
                {recIds.has(i.id) ? "★ " : ""}{i.abbreviation} — {i.raterRole} ({i.population.replace(/_/g, " ")}){recIds.has(i.id) ? ` · ${t("recommendedTag")}` : ""}
              </option>
            ))}
          </select>
          {recIds.size > 0 && <p className="text-xs mt-1" style={{ color: C.spruce }}>{t("recommendedHint")}</p>}
        </Field>
        <Field label={t("channelLabel")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 150 }} value={effectiveMode}
            onChange={(e) => setMode(e.target.value as CollectMode)}>
            {modes.map((m) => <option key={m.key} value={m.key} disabled={!m.enabled}>{m.label}</option>)}
          </select>
        </Field>
        {(effectiveMode === "limesurvey" || effectiveMode === "csv") && (
          <Field label={t("ratedBy")}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 110 }} value={role} onChange={(e) => setRole(e.target.value)}>
              {["self", "mother", "father", "parent", "teacher", "caregiver", "clinician"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        )}
        {isWave && effectiveMode !== "manual" && (
          <Field label={t("waveLabel")}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 100 }} value={wave} onChange={(e) => setWave(e.target.value)}>
              <option value="">—</option>
              {waves.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
        )}
      </div>
      {(effectiveMode === "limesurvey" || effectiveMode === "in_app") && (
        <div className="flex items-end gap-2 flex-wrap mt-2">
          <Field label={t("recipientEmail")}>
            <input style={{ ...inputStyle, width: 220 }} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {effectiveMode === "limesurvey" && (
            <>
              <Field label={inst.limesurveySurveyId ? t("surveyIdLinked", { id: inst.limesurveySurveyId }) : t("surveyIdUnlinked")}>
                <input style={{ ...inputStyle, width: 170 }} value={surveyId} onChange={(e) => setSurveyId(e.target.value)} />
              </Field>
              <Field label={t("remindEveryLabel")}>
                <input type="number" min={1} placeholder="—" style={{ ...inputStyle, width: 80 }} value={remindDays} onChange={(e) => setRemindDays(e.target.value)} />
              </Field>
              <Field label={t("maxRemindersLabel")}>
                <input type="number" min={1} placeholder="—" style={{ ...inputStyle, width: 70 }} value={maxRem} onChange={(e) => setMaxRem(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      )}
      {effectiveMode === "csv" && (
        <div className="mt-2">
          <textarea style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} rows={3}
            placeholder={t("csvPlaceholder", { code: inst.items[0]?.id ?? "SDQ1" })}
            value={csv} onChange={(e) => setCsv(e.target.value)} />
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap mt-2">
        {effectiveMode === "manual" ? (
          <PrimaryButton small onClick={() => onStartManualEntry(inst)}>{t("openManualForm")}</PrimaryButton>
        ) : effectiveMode === "csv" ? (
          <PrimaryButton small disabled={busy || !csv.trim()} onClick={() => void importCsv()}>
            {busy ? t("working") : t("importCsv")}
          </PrimaryButton>
        ) : (
          <PrimaryButton small disabled={busy || !canSend} onClick={() => void send()}>
            {busy ? t("working") : t("sendInvitation")}
          </PrimaryButton>
        )}
        <p className="text-xs" style={{ color: C.muted }}>
          {effectiveMode === "manual"
            ? t("manualEntry")
            : effectiveMode === "csv"
              ? t("haveAnswers")
              : effectiveMode === "in_app"
                ? t("inAppChannelHint")
                : configured
                  ? t("inviteHint")
                  : t("lsNotConfigured")}
        </p>
      </div>
      {(effectiveMode === "limesurvey" || effectiveMode === "in_app") && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>{t("emailSavedHint")}</p>
      )}
      {err && <p className="text-xs mt-2" style={{ color: C.danger }}>{err}</p>}
    </div>
  );
}

/// Step 2 of "log a held session": send the every-session questionnaires for
/// that session — pre-selected, linked to the ledger entry, skippable.
function SendAfterSessionStep({ patient, instruments, configured, log, onDone, onSkip, onStartManualEntry }: {
  patient: Patient;
  instruments: InstrumentDef[];
  configured: boolean;
  log: SessionLogRecord;
  onDone: (p: Patient, message: string) => void;
  onSkip: () => void;
  onStartManualEntry: (inst: InstrumentDef, ctx: { sessionNumber?: number }) => void;
}) {
  const t = useT();
  const sessionInstruments = useMemo(
    () =>
      instruments.filter(
        (i) =>
          i.id !== DIPS_INSTRUMENT_ID &&
          i.instrumentType === "likert_battery" &&
          i.cadenceType === "every_session" &&
          populationMatches(i, patient),
      ),
    [instruments, patient],
  );
  const fillableIds = useMemo(
    () => new Set(patientFillable(instruments, patient).map((i) => i.id)),
    [instruments, patient],
  );
  const [checked, setChecked] = useState<Set<string>>(() => new Set(sessionInstruments.map((i) => i.id)));
  const [channel, setChannel] = useState<"limesurvey" | "in_app">(configured ? "limesurvey" : "in_app");
  const [email, setEmail] = useState(patient.email ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const viable = (inst: InstrumentDef) =>
    channel === "in_app" ? fillableIds.has(inst.id) : configured && !!inst.limesurveySurveyId;
  const toSend = sessionInstruments.filter((i) => checked.has(i.id) && viable(i));
  const errText = (m: string) =>
    m === "network_restricted" ? t("networkRestricted") : m === "email_taken" ? t("emailTaken") : m;

  const send = async () => {
    setBusy(true);
    setErrors([]);
    // Sequential per-instrument creates; the LAST returned patient wins the
    // merge (each response is a full serialization, interleaving is stale).
    let latest: Patient | null = null;
    const errs: string[] = [];
    let sent = 0;
    for (const inst of toSend) {
      try {
        const r = await api.createInvitation(patient.id, {
          instrumentId: inst.id,
          channel,
          respondentRole: "self",
          email: email.trim() || undefined,
          sessionNumber: log.sessionNumber ?? undefined,
          sessionLogId: log.id,
        });
        latest = r.patient;
        sent += 1;
        if (r.warning) errs.push(`⚠ ${inst.abbreviation}: ${r.warning}`);
      } catch (e) {
        errs.push(`✗ ${inst.abbreviation}: ${errText((e as Error).message)}`);
      }
    }
    setBusy(false);
    if (latest && errs.length === 0) {
      onDone(latest, t("sendStepSent", { n: sent }));
    } else {
      // Partial failure: surface per-instrument errors, keep the step open.
      if (latest) setErrors([t("sendStepSent", { n: sent }), ...errs]);
      else setErrors(errs);
    }
  };

  return (
    <div className="rounded-lg p-3 mt-2" style={{ background: C.spruceSoft, border: `1px solid ${C.spruce}` }}>
      <p className="text-sm font-bold" style={{ color: C.spruce }}>
        {log.sessionNumber != null ? t("sendStepTitle", { n: log.sessionNumber }) : t("sendStepTitleNoNum")}
      </p>
      <p className="text-xs mt-0.5 mb-2" style={{ color: C.muted }}>{t("sendStepSub")}</p>
      {sessionInstruments.length === 0 ? (
        <p className="text-xs" style={{ color: C.muted }}>{t("sendStepNoInstruments")}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1 mb-2">
            {sessionInstruments.map((inst) => {
              const ok = viable(inst);
              return (
                <label key={inst.id} className="flex items-center gap-2 text-sm" style={{ color: ok ? C.ink : C.muted }}
                  title={ok ? undefined : channel === "in_app" ? t("inAppNotPossible") : t("surveyIdUnlinked")}>
                  <input type="checkbox" disabled={!ok} checked={checked.has(inst.id) && ok}
                    onChange={(e) => {
                      const next = new Set(checked);
                      if (e.target.checked) next.add(inst.id); else next.delete(inst.id);
                      setChecked(next);
                    }} />
                  <span className="font-semibold">{inst.abbreviation}</span>
                  <span className="text-xs" style={{ color: C.muted }}>{inst.name}</span>
                  <button type="button" className="ml-auto text-xs font-semibold"
                    style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    onClick={() => onStartManualEntry(inst, { sessionNumber: log.sessionNumber ?? undefined })}>
                    {t("enterManually")}
                  </button>
                </label>
              );
            })}
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <Field label={t("channelLabel")}>
              <select style={{ ...inputStyle, width: "auto", minWidth: 130 }} value={channel}
                onChange={(e) => setChannel(e.target.value as "limesurvey" | "in_app")}>
                <option value="limesurvey" disabled={!configured}>LimeSurvey</option>
                <option value="in_app">{t("channelInApp")}</option>
              </select>
            </Field>
            <Field label={t("recipientEmail")}>
              <input style={{ ...inputStyle, width: 220 }} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs mt-1" style={{ color: C.muted }}>{t("emailSavedHint")}</p>
        </>
      )}
      <div className="flex items-center gap-2 mt-2">
        {sessionInstruments.length > 0 && (
          <PrimaryButton small disabled={busy || toSend.length === 0} onClick={() => void send()}>
            {busy ? t("working") : t("sendStepSend")}
          </PrimaryButton>
        )}
        <GhostButton small onClick={onSkip}>{t("sendStepSkip")}</GhostButton>
      </div>
      {errors.length > 0 && (
        <div className="mt-2">
          {errors.map((e, i) => (
            <p key={i} className="text-xs" style={{ color: e.startsWith("✗") ? C.danger : C.spruce }}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/// The panel. Lists are always derived from props (never snapshotted into
/// state): in MonitoringView the surrounding block does NOT remount on
/// patientUpdated merges.
export function SessionMonitoringPanel({ patient, instruments, therapists, user, configured, variant, onPatientUpdated, onStartManualEntry }: {
  patient: Patient;
  instruments: InstrumentDef[];
  therapists: Therapist[];
  user: SessionUser;
  configured: boolean;
  variant: "dossier" | "monitoring";
  onPatientUpdated: (p: Patient) => void;
  onStartManualEntry: (inst: InstrumentDef, ctx: { sessionNumber?: number }) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const now = new Date();
  const readOnly = patient.status === "archived";
  // Dossier variant: collapsed by default — the one-line summary carries the
  // essentials, the ledger + lists expand on demand.
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // The dossier shows the log form as soon as the card expands (expanding IS
  // the opt-in); the caseload view keeps each row compact behind a toggle.
  const [showLogForm, setShowLogForm] = useState(variant === "dossier");
  const [sendStep, setSendStep] = useState<SessionLogRecord | null>(null);

  // Log-session form.
  const [type, setType] = useState<string>("held");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [conductedById, setConductedById] = useState<string>(
    user.role === "therapist" ? user.id : patient.therapistId ?? "",
  );
  const [note, setNote] = useState("");
  // Suggested next session number, recomputed from live props; null override
  // means "not edited" so the suggestion auto-advances after each save.
  const suggested = suggestNextSessionNumber(patient);
  const [numOverride, setNumOverride] = useState<string | null>(null);
  const sessionNumber = numOverride ?? String(suggested);
  const numValid =
    sessionNumber.trim() === "" || (Number.isInteger(Number(sessionNumber)) && Number(sessionNumber) >= 0);

  const abbr = (inv: InvitationRecord) =>
    instruments.find((i) => i.id === inv.instrumentId)?.abbreviation ?? inv.instrumentId;

  const openInvs = patient.invitations.filter((i) => isOpenInvitation(i.status) || i.status === "error");
  const completedRecent = patient.invitations
    .filter((i) => i.status === "completed" && i.completedAt && now.getTime() - Date.parse(i.completedAt) <= 30 * 864e5)
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!))
    .slice(0, 5);
  const openCount = patient.invitations.filter((i) => isOpenInvitation(i.status)).length;

  // Ledger measurement chips: invitations linked by FK, plus responses matched
  // by sessionNumber that none of THIS row's invitations already accounts for
  // (how manual/CSV entries — and fills of since-unlinked requests — earn ✓).
  const chipsFor = (log: SessionLogRecord) => {
    const invs = patient.invitations.filter((i) => i.sessionLogId === log.id);
    const covered = new Set(invs.map((i) => i.responseId).filter(Boolean));
    const responses =
      log.sessionNumber != null
        ? patient.responses.filter((r) => r.sessionNumber === log.sessionNumber && !covered.has(r.id))
        : [];
    return { invs, responses };
  };
  const heldNums = new Set(
    patient.sessionLogs.filter((l) => l.type === "held" && l.sessionNumber != null).map((l) => l.sessionNumber),
  );
  // Transition hint: measurements that predate the ledger (or were entered
  // without logging the session).
  const unloggedCount = new Set(
    patient.responses.map((r) => r.sessionNumber).filter((n) => n != null && !heldNums.has(n)),
  ).size;

  const run = async (fn: () => Promise<{ patient: Patient }>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      onPatientUpdated(r.patient);
      setMsg(done);
    } catch (e) {
      setMsg(`✗ ${(e as Error).message === "network_restricted" ? t("networkRestricted") : (e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const saveLog = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const num = type === "held" && sessionNumber.trim() !== "" ? Number(sessionNumber) : null;
      const r = await api.logSession(patient.id, {
        occurredAt: `${date}T12:00:00`,
        type,
        sessionNumber: num,
        conductedById: conductedById || null,
        note: note.trim() || undefined,
      });
      onPatientUpdated(r.patient);
      setNote("");
      setNumOverride(null);
      if (type === "held") setSendStep(r.sessionLog);
      else setMsg(t("logSaved"));
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteLog = async (log: SessionLogRecord) => {
    const linked = patient.invitations.filter((i) => i.sessionLogId === log.id).length;
    if (linked > 0 && !window.confirm(t("deleteLogLinked", { n: linked }))) return;
    await run(() => api.deleteSessionLog(log.id), "");
  };

  const doSync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.syncLimesurvey(patient.id);
      const p = await api.getPatient(patient.id);
      onPatientUpdated(p.patient);
      setMsg(`✓ ${r.imported} / ${r.checked}${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}`);
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // Empty read-only panel (e.g. archived patient without any collection): skip.
  if (readOnly && !patient.invitations.length && !patient.sessionLogs.length) return null;

  const invitationRow = (inv: InvitationRecord, withActions: boolean) => (
    <div key={inv.id} className="rounded-lg px-3 py-2" style={{ background: variant === "monitoring" ? C.surface : C.surfaceAlt, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold" style={{ color: C.ink }}>{abbr(inv)}</span>
        <ChannelChip channel={inv.channel} />
        <span className="text-xs" style={{ color: C.muted }}>
          {trRaterRole(inv.respondentRole, lang)}
          {inv.channel === "limesurvey" && inv.email ? ` · ${inv.email}` : ""}
          {inv.context.wave ? ` · ${inv.context.wave}` : ""}
          {inv.context.sessionNumber != null ? ` · ${t("sessionN")} ${inv.context.sessionNumber}` : ""}
        </span>
        <span className="text-xs font-bold" style={{ color: statusColor[inv.status] ?? C.muted }}>
          {trInvitationStatus(inv.status, lang)}
          {inv.sentAt ? ` · ${fmtDate(inv.sentAt)}` : ` · ${fmtDate(inv.createdAt)}`}
          {inv.completedAt ? ` · ✓ ${fmtDate(inv.completedAt)}` : ""}
        </span>
        {withActions && isOverdue(inv, now) && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
            {t("overdueChip")}
          </span>
        )}
        {withActions && !readOnly && (
          <span className="ml-auto flex gap-2">
            {configured && inv.channel === "limesurvey" && (inv.status === "invited" || inv.status === "reminded") && (
              <GhostButton small onClick={() => { if (!busy) void run(() => api.remindInvitation(inv.id), t("reminderSent")); }}>
                {t("sendReminder")}
              </GhostButton>
            )}
            {isOpenInvitation(inv.status) && (
              <GhostButton small onClick={() => {
                if (busy || !window.confirm(t("confirmNoResponse"))) return;
                void run(() => api.markNoResponse(inv.id), t("noResponseMarked"));
              }}>
                {t("markNoResponse")}
              </GhostButton>
            )}
            <GhostButton small onClick={() => {
              if (busy || !window.confirm(t("confirmCancelInvitation"))) return;
              void run(() => api.cancelInvitation(inv.id), t("invitationCancelled"));
            }}>
              {t("cancelInvitation")}
            </GhostButton>
          </span>
        )}
      </div>
      {withActions && !readOnly && inv.channel === "limesurvey" && (
        <div className="mt-1">
          <ScheduleEditor inv={inv} onSave={(days, max) => { if (!busy) void run(() => api.scheduleInvitation(inv.id, days, max), t("scheduleSaved")); }} />
        </div>
      )}
      {inv.lastError && <p className="text-xs mt-1" style={{ color: C.danger }}>{inv.lastError}</p>}
    </div>
  );

  const body = (
    <>
      {/* Compact action row: the caseload view toggles the log form; the
          ad-hoc request form is a toggle on both surfaces. */}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {variant === "monitoring" && (
            <GhostButton small onClick={() => setShowLogForm(!showLogForm)}>{t("sessionLogTitle")}</GhostButton>
          )}
          <GhostButton small onClick={() => setShowNewRequest(!showNewRequest)}>{t("newQuestionnaire")}</GhostButton>
          {variant === "dossier" && configured && (
            <GhostButton small onClick={() => { if (!busy) void doSync(); }}>{busy ? t("working") : t("syncNow")}</GhostButton>
          )}
        </div>
      )}

      {/* Log a session — held sessions chain into the send step below. */}
      {!readOnly && showLogForm && (
        <>
          <p className="text-xs mt-2 mb-2" style={{ color: C.muted }}>{t("sessionLogSub")}</p>
          <div className="flex gap-3 flex-wrap items-end">
            <Field label={t("logDateLabel")}>
              <input type="date" style={{ ...inputStyle, width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("logTypeLabel")}>
              <select style={{ ...inputStyle, width: "auto", minWidth: 160 }} value={type} onChange={(e) => setType(e.target.value)}>
                {SESSION_LOG_TYPES.map((v) => <option key={v} value={v}>{trSessionLogType(v, lang)}</option>)}
              </select>
            </Field>
            {type === "held" && (
              <Field label={`${t("sessionNumberLabel")} (${t("sessionNumberHint")})`}>
                <input type="number" min={0} step={1} style={{ ...inputStyle, width: 90 }} value={sessionNumber}
                  onChange={(e) => setNumOverride(e.target.value)} />
              </Field>
            )}
            <Field label={t("conductedBy")}>
              <select style={{ ...inputStyle, width: "auto", minWidth: 170 }} value={conductedById} onChange={(e) => setConductedById(e.target.value)}>
                <option value="">—</option>
                {therapists.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
              </select>
            </Field>
            <Field label={t("logNoteLabel")}>
              <input style={{ ...inputStyle, width: 200 }} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <PrimaryButton small disabled={busy || !numValid} onClick={() => void saveLog()}>{t("logSave")}</PrimaryButton>
          </div>
        </>
      )}

      {showNewRequest && !readOnly && (
        <NewRequestForm patient={patient} instruments={instruments} configured={configured}
          onDone={(p, message) => { onPatientUpdated(p); setMsg(message); setShowNewRequest(false); }}
          onStartManualEntry={(inst) => onStartManualEntry(inst, {})} />
      )}

      {sendStep && !readOnly && (
        <SendAfterSessionStep
          patient={patient}
          instruments={instruments}
          configured={configured}
          log={sendStep}
          onDone={(p, message) => { onPatientUpdated(p); setSendStep(null); setMsg(message); }}
          onSkip={() => setSendStep(null)}
          onStartManualEntry={onStartManualEntry}
        />
      )}

      {/* Outstanding questionnaire requests. */}
      {openInvs.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("invitationsTitle")} — {t("openInvitationsHeading")}</p>
          <div className="flex flex-col gap-1.5">
            {[...openInvs].reverse().map((inv) => invitationRow(inv, true))}
          </div>
        </div>
      )}

      {/* Session ledger. */}
      {patient.sessionLogs.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("ledgerTitle")}</p>
          <div className="flex flex-col gap-1">
            {[...patient.sessionLogs].reverse().map((l) => {
              const by = therapists.find((th) => th.id === l.conductedById);
              const { invs, responses } = chipsFor(l);
              return (
                <div key={l.id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-1.5 text-xs" style={{ background: variant === "monitoring" ? C.surface : C.surfaceAlt, border: `1px solid ${C.line}` }}>
                  <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtDate(l.occurredAt)}</span>
                  <span className="font-semibold" style={{ color: l.type === "held" ? C.spruce : C.amber }}>{trSessionLogType(l.type, lang)}</span>
                  {l.sessionNumber != null && (
                    <span className="font-semibold" style={{ color: C.ink }}>{t("sessionN")} {l.sessionNumber}</span>
                  )}
                  {invs.map((inv) => (
                    <span key={inv.id} className="px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        background: inv.status === "completed" ? C.spruceSoft : isOpenInvitation(inv.status) ? C.blueSoft : C.surface,
                        color: inv.status === "completed" ? C.spruce : isOpenInvitation(inv.status) ? C.blue : C.muted,
                      }}>
                      {abbr(inv)} {inv.status === "completed" ? "✓" : isOpenInvitation(inv.status) ? t("chipOpen") : trInvitationStatus(inv.status, lang)}
                    </span>
                  ))}
                  {responses.map((r) => {
                    const inst = instruments.find((i) => i.id === r.instrumentId);
                    return (
                      <span key={r.id} className="px-2 py-0.5 rounded-full font-semibold" style={{ background: C.spruceSoft, color: C.spruce }}>
                        {inst?.abbreviation ?? r.instrumentId} ✓
                      </span>
                    );
                  })}
                  {by && <span style={{ color: C.muted }}>{t("conductedBy")}: {by.name}</span>}
                  {l.note && <span style={{ color: C.muted }}>“{l.note}”</span>}
                  {!readOnly && (
                    <button type="button" className="ml-auto font-semibold" onClick={() => void deleteLog(l)}
                      style={{ color: C.danger, background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>
                      {t("logDelete")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {unloggedCount > 0 && (
            <p className="text-xs mt-1" style={{ color: C.muted }}>{t("unloggedMeasurements", { n: unloggedCount })}</p>
          )}
        </div>
      )}
      {patient.sessionLogs.length === 0 && unloggedCount > 0 && (
        <p className="text-xs mt-2" style={{ color: C.muted }}>{t("unloggedMeasurements", { n: unloggedCount })}</p>
      )}

      {/* Recently completed. */}
      {completedRecent.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("recentlyCompletedHeading")}</p>
          <div className="flex flex-col gap-1.5">
            {completedRecent.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-1.5" style={{ background: variant === "monitoring" ? C.surface : C.surfaceAlt, border: `1px solid ${C.line}` }}>
                <span className="text-sm font-semibold" style={{ color: C.ink }}>{abbr(inv)}</span>
                <ChannelChip channel={inv.channel} />
                {inv.context.sessionNumber != null && (
                  <span className="text-xs" style={{ color: C.muted }}>{t("sessionN")} {inv.context.sessionNumber}</span>
                )}
                <span className="text-xs font-bold" style={{ color: C.spruce }}>✓ {inv.completedAt ? fmtDate(inv.completedAt) : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full request history (incl. cancelled / no-response), collapsed. */}
      {patient.invitations.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowHistory(!showHistory)} className="text-xs font-semibold"
            style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            {showHistory ? t("invHistoryHide") : t("invHistoryShow")}
          </button>
          {showHistory && (
            <div className="flex flex-col gap-1.5 mt-2">
              {[...patient.invitations].reverse().map((inv) => invitationRow(inv, false))}
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-xs mt-2" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </>
  );

  if (variant === "monitoring") {
    return (
      <div>
        {openInvs.length === 0 && completedRecent.length === 0 && patient.sessionLogs.length === 0 && (
          <p className="text-xs mt-1" style={{ color: C.muted }}>{t("noInvitationsYet")}</p>
        )}
        {body}
      </div>
    );
  }

  return (
    <Card className="p-5 mb-4">
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 flex-wrap text-left"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("navMonitoring")}</h3>
        <span className="text-xs" style={{ color: C.muted }}>
          {patient.sessionLogs.length || patient.invitations.length
            ? t("panelSummary", { sessions: patient.sessionLogs.length, open: openCount })
            : t("logSummaryEmpty")}
        </span>
        <span className="ml-auto text-xs font-semibold" style={{ color: C.spruce }}>
          {expanded ? `▴ ${t("panelHide")}` : `▸ ${t("panelShow")}`}
        </span>
      </button>
      {expanded && body}
    </Card>
  );
}
