"use client";
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { api } from "@/lib/api-client";
import type { ClinicData, InvitationRecord, Patient, SessionUser } from "@/lib/types";
import { DIPS_INSTRUMENT_ID } from "@/lib/types";
import type { InstrumentDef } from "@/lib/instruments/types";
import { isOpenInvitation, isOverdue } from "@/lib/reminders";
import { patientFillable } from "./PatientHome";
import { Card, Field, GhostButton, PrimaryButton, SectionTitle, Stat, StatusBadge, inputStyle } from "./ui";
import { useT } from "./LangContext";

const statusColor: Record<string, string> = {
  completed: C.spruce,
  error: C.danger,
  invited: C.blue,
  reminded: C.amber,
  created: C.muted,
  cancelled: C.muted,
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

/// Per-patient form to send a new questionnaire: LimeSurvey e-mail invitation
/// or an in-app task (only instruments with full item wording).
function NewRequestForm({ patient, instruments, configured, onDone }: {
  patient: Patient;
  instruments: InstrumentDef[];
  configured: boolean;
  onDone: (p: Patient, message: string) => void;
}) {
  const t = useT();
  const candidates = useMemo(
    () => instruments.filter((i) => i.id !== DIPS_INSTRUMENT_ID && i.instrumentType === "likert_battery"),
    [instruments],
  );
  const fillableIds = useMemo(() => new Set(patientFillable(instruments).map((i) => i.id)), [instruments]);
  const [instId, setInstId] = useState(candidates[0]?.id ?? "");
  const inst = candidates.find((i) => i.id === instId);
  const inAppPossible = fillableIds.has(instId);
  const [channel, setChannel] = useState<"limesurvey" | "in_app">(configured ? "limesurvey" : "in_app");
  const effectiveChannel = channel === "in_app" && !inAppPossible ? "limesurvey" : channel;
  const [role, setRole] = useState("self");
  const [wave, setWave] = useState("");
  const [email, setEmail] = useState(patient.email ?? "");
  const [surveyId, setSurveyId] = useState("");
  const [remindDays, setRemindDays] = useState("");
  const [maxRem, setMaxRem] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!inst) return null;
  const isWave = inst.cadenceType === "wave";
  const waves = inst.cadenceConfig.waves ?? ["pre", "zm", "post", "postF"];
  const canSend =
    effectiveChannel === "in_app"
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
        channel: effectiveChannel,
        respondentRole: effectiveChannel === "in_app" ? "self" : role,
        email: effectiveChannel === "limesurvey" ? email.trim() : undefined,
        wave: isWave && wave ? wave : undefined,
        surveyId: effectiveChannel === "limesurvey" ? surveyId.trim() || undefined : undefined,
        remindEveryDays: Number.isInteger(days) && days > 0 ? days : undefined,
        maxReminders: Number.isInteger(max) && max > 0 ? max : undefined,
      });
      onDone(
        r.patient,
        `${effectiveChannel === "in_app" ? t("taskCreated") : t("invitationCreated")}${r.warning ? ` ⚠ ${r.warning}` : ""}`,
      );
    } catch (e) {
      setErr(`✗ ${(e as Error).message === "network_restricted" ? t("networkRestricted") : (e as Error).message}`);
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
              <option key={i.id} value={i.id}>{i.abbreviation} — {i.raterRole} ({i.population.replace(/_/g, " ")})</option>
            ))}
          </select>
        </Field>
        <Field label={t("channelLabel")}>
          <select style={{ ...inputStyle, width: "auto", minWidth: 130 }} value={effectiveChannel}
            onChange={(e) => setChannel(e.target.value as "limesurvey" | "in_app")}>
            <option value="limesurvey" disabled={!configured}>LimeSurvey</option>
            <option value="in_app" disabled={!inAppPossible}>{t("channelInApp")}</option>
          </select>
        </Field>
        {effectiveChannel === "limesurvey" && (
          <Field label={t("ratedBy")}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 110 }} value={role} onChange={(e) => setRole(e.target.value)}>
              {["self", "mother", "father", "parent", "teacher", "caregiver", "clinician"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        )}
        {isWave && (
          <Field label={t("waveLabel")}>
            <select style={{ ...inputStyle, width: "auto", minWidth: 100 }} value={wave} onChange={(e) => setWave(e.target.value)}>
              <option value="">—</option>
              {waves.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
        )}
      </div>
      {effectiveChannel === "limesurvey" && (
        <div className="flex items-end gap-2 flex-wrap mt-2">
          <Field label={t("recipientEmail")}>
            <input style={{ ...inputStyle, width: 220 }} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={inst.limesurveySurveyId ? t("surveyIdLinked", { id: inst.limesurveySurveyId }) : t("surveyIdUnlinked")}>
            <input style={{ ...inputStyle, width: 170 }} value={surveyId} onChange={(e) => setSurveyId(e.target.value)} />
          </Field>
          <Field label={t("remindEveryLabel")}>
            <input type="number" min={1} placeholder="—" style={{ ...inputStyle, width: 80 }} value={remindDays} onChange={(e) => setRemindDays(e.target.value)} />
          </Field>
          <Field label={t("maxRemindersLabel")}>
            <input type="number" min={1} placeholder="—" style={{ ...inputStyle, width: 70 }} value={maxRem} onChange={(e) => setMaxRem(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap mt-2">
        <PrimaryButton small disabled={busy || !canSend} onClick={() => void send()}>
          {busy ? t("working") : t("sendInvitation")}
        </PrimaryButton>
        <p className="text-xs" style={{ color: C.muted }}>
          {effectiveChannel === "in_app"
            ? t("inAppChannelHint")
            : configured
              ? t("inviteHint")
              : t("lsNotConfigured")}
        </p>
      </div>
      {!inAppPossible && channel === "in_app" && (
        <p className="text-xs mt-1" style={{ color: C.amber }}>{t("inAppNotPossible")}</p>
      )}
      {err && <p className="text-xs mt-2" style={{ color: C.danger }}>{err}</p>}
    </div>
  );
}

function PatientBlock({ patient, instruments, configured, now, onOpenPatient, onPatientUpdated }: {
  patient: Patient;
  instruments: InstrumentDef[];
  configured: boolean;
  now: Date;
  onOpenPatient: (id: string) => void;
  onPatientUpdated: (p: Patient) => void;
}) {
  const t = useT();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const abbr = (inv: InvitationRecord) => instruments.find((i) => i.id === inv.instrumentId)?.abbreviation ?? inv.instrumentId;

  const open = patient.invitations.filter((i) => isOpenInvitation(i.status) || i.status === "error");
  const completedRecent = patient.invitations
    .filter((i) => i.status === "completed" && i.completedAt && now.getTime() - Date.parse(i.completedAt) <= 30 * 864e5)
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!))
    .slice(0, 5);

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

  return (
    <div className="rounded-lg px-3 py-3 mb-2" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full shrink-0" style={{ width: 11, height: 11, background: patient.color }} />
        <button type="button" onClick={() => onOpenPatient(patient.id)} className="font-semibold text-sm"
          style={{ color: C.ink, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {patient.name}
        </button>
        <StatusBadge status={patient.status} />
        <span className="ml-auto">
          <GhostButton small onClick={() => setShowForm(!showForm)}>{t("newQuestionnaire")}</GhostButton>
        </span>
      </div>

      {showForm && (
        <NewRequestForm patient={patient} instruments={instruments} configured={configured}
          onDone={(p, message) => { onPatientUpdated(p); setMsg(message); setShowForm(false); }} />
      )}

      {open.length === 0 && completedRecent.length === 0 && !showForm && (
        <p className="text-xs mt-2" style={{ color: C.muted }}>{t("noInvitationsYet")}</p>
      )}

      {open.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("openInvitationsHeading")}</p>
          <div className="flex flex-col gap-1.5">
            {[...open].reverse().map((inv) => (
              <div key={inv.id} className="rounded-lg px-3 py-2" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: C.ink }}>{abbr(inv)}</span>
                  <ChannelChip channel={inv.channel} />
                  <span className="text-xs" style={{ color: C.muted }}>
                    {inv.respondentRole}{inv.channel === "limesurvey" && inv.email ? ` · ${inv.email}` : ""}{inv.context.wave ? ` · ${inv.context.wave}` : ""}
                  </span>
                  <span className="text-xs font-bold" style={{ color: statusColor[inv.status] ?? C.muted }}>
                    {inv.status}{inv.sentAt ? ` · ${fmtDate(inv.sentAt)}` : ` · ${fmtDate(inv.createdAt)}`}
                  </span>
                  {isOverdue(inv, now) && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
                      {t("overdueChip")}
                    </span>
                  )}
                  <span className="ml-auto flex gap-2">
                    {configured && inv.channel === "limesurvey" && (inv.status === "invited" || inv.status === "reminded") && (
                      <GhostButton small onClick={() => { if (!busy) void run(() => api.remindInvitation(inv.id), t("reminderSent")); }}>
                        {t("sendReminder")}
                      </GhostButton>
                    )}
                    <GhostButton small onClick={() => {
                      if (busy || !window.confirm(t("confirmCancelInvitation"))) return;
                      void run(() => api.cancelInvitation(inv.id), t("invitationCancelled"));
                    }}>
                      {t("cancelInvitation")}
                    </GhostButton>
                  </span>
                </div>
                <div className="mt-1">
                  <ScheduleEditor inv={inv} onSave={(days, max) => { if (!busy) void run(() => api.scheduleInvitation(inv.id, days, max), t("scheduleSaved")); }} />
                </div>
                {inv.lastError && <p className="text-xs mt-1" style={{ color: C.danger }}>{inv.lastError}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {completedRecent.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("recentlyCompletedHeading")}</p>
          <div className="flex flex-col gap-1.5">
            {completedRecent.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-1.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                <span className="text-sm font-semibold" style={{ color: C.ink }}>{abbr(inv)}</span>
                <ChannelChip channel={inv.channel} />
                <span className="text-xs font-bold" style={{ color: C.spruce }}>✓ {inv.completedAt ? fmtDate(inv.completedAt) : ""}</span>
                <button type="button" onClick={() => onOpenPatient(patient.id)} className="ml-auto text-xs font-semibold"
                  style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  {t("openPatientLink")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <p className="text-xs mt-2" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </div>
  );
}

/// Per-therapist questionnaire monitoring: every invitation/task across the
/// caseload with completion status, overdue flags, reminder schedules and a
/// per-patient "send new questionnaire" form. Directors see all caseloads.
export function MonitoringView({ data, user, onBack, onOpenPatient, onPatientUpdated, onRefreshAll }: {
  data: ClinicData;
  user: SessionUser;
  onBack: () => void;
  onOpenPatient: (id: string) => void;
  onPatientUpdated: (p: Patient) => void;
  onRefreshAll: () => void;
}) {
  const t = useT();
  const isDirector = user.role === "director";
  const [therapistFilter, setTherapistFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const now = new Date();
  const configured = data.limesurveyConfigured;

  const scoped = isDirector ? data.patients : data.patients.filter((p) => p.therapistId === user.id);
  const allInvs = scoped.flatMap((p) => p.invitations);
  const openCount = allInvs.filter((i) => isOpenInvitation(i.status)).length;
  const overdueCount = allInvs.filter((i) => isOverdue(i, now)).length;
  const completed30 = allInvs.filter(
    (i) => i.status === "completed" && i.completedAt && now.getTime() - Date.parse(i.completedAt) <= 30 * 864e5,
  ).length;

  const doSync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.syncLimesurvey();
      setMsg(`✓ ${r.imported} / ${r.checked}${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}`);
      onRefreshAll();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const doSweep = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.runReminderSweep();
      setMsg(
        r.skipped
          ? t("sweepSkipped", { reason: r.skipped })
          : t("sweepResult", {
              imported: r.sync?.imported ?? 0,
              checked: r.sync?.checked ?? 0,
              sent: r.reminders?.sent ?? 0,
              due: r.reminders?.due ?? 0,
            }),
      );
      onRefreshAll();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const groups: { therapist: { id: string; name: string } | null; patients: Patient[] }[] = isDirector
    ? [
        ...data.therapists
          .filter((th) => therapistFilter === "all" || th.id === therapistFilter)
          .map((th) => ({ therapist: th, patients: scoped.filter((p) => p.therapistId === th.id) })),
        ...(therapistFilter === "all"
          ? [{ therapist: null, patients: scoped.filter((p) => !p.therapistId) }]
          : []),
      ].filter((g) => g.patients.length > 0)
    : [{ therapist: null, patients: scoped }];

  return (
    <div className="max-w-4xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3"
        style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {t("backToOverview")}
      </button>

      <SectionTitle sub={t("monitoringSub")}>{t("monitoringTitle")}</SectionTitle>

      {!configured && (
        <Card className="p-4 mb-4" style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
          <p className="text-sm font-semibold" style={{ color: C.amber }}>{t("lsNotConfigured")}</p>
        </Card>
      )}

      <div className="flex gap-3 mb-4 flex-wrap items-stretch">
        <Stat label={t("statOpenInvitations")} value={openCount} />
        <Stat label={t("statOverdue")} value={<span style={{ color: overdueCount > 0 ? C.amber : C.ink }}>{overdueCount}</span>} />
        <Stat label={t("statCompleted30")} value={completed30} />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {configured && (
          <>
            <GhostButton small onClick={() => { if (!busy) void doSync(); }}>{busy ? t("working") : t("syncNow")}</GhostButton>
            <GhostButton small onClick={() => { if (!busy) void doSweep(); }}>{busy ? t("working") : t("runSweepNow")}</GhostButton>
          </>
        )}
        {isDirector && (
          <select style={{ ...inputStyle, width: "auto", minWidth: 180, marginLeft: "auto" }} value={therapistFilter} onChange={(e) => setTherapistFilter(e.target.value)}>
            <option value="all">{t("therapistFilterAll")}</option>
            {data.therapists.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
          </select>
        )}
        {msg && <p className="text-xs w-full" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
      </div>

      {groups.map((g) => (
        <Card key={g.therapist?.id ?? "own"} className="p-5 mb-4">
          {isDirector && (
            <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>
              {g.therapist ? g.therapist.name : t("unassigned")}
            </h3>
          )}
          {g.patients.map((p) => (
            <PatientBlock key={p.id} patient={p} instruments={data.instruments} configured={configured}
              now={now} onOpenPatient={onOpenPatient} onPatientUpdated={onPatientUpdated} />
          ))}
        </Card>
      ))}
    </div>
  );
}
