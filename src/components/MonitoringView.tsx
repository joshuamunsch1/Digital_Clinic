"use client";
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { api } from "@/lib/api-client";
import type { ClinicData, Patient, SessionUser } from "@/lib/types";
import type { InstrumentDef } from "@/lib/instruments/types";
import { isOpenInvitation, isOverdue } from "@/lib/reminders";
import { InstrumentForm } from "./InstrumentForm";
import { SessionMonitoringPanel } from "./SessionMonitoringPanel";
import { Card, GhostButton, SectionTitle, Stat, StatusBadge, inputStyle } from "./ui";
import { useT } from "./LangContext";

/// One caseload row: patient header + the shared "Sitzungen & Fragebögen"
/// panel (same component the dossier embeds — log sessions, send/track
/// questionnaire requests). Always expanded here; the caseload view IS the
/// monitoring surface.
function PatientBlock({ patient, instruments, therapists, user, configured, onOpenPatient, onPatientUpdated, onStartManualEntry }: {
  patient: Patient;
  instruments: InstrumentDef[];
  therapists: ClinicData["therapists"];
  user: SessionUser;
  configured: boolean;
  onOpenPatient: (id: string) => void;
  onPatientUpdated: (p: Patient) => void;
  onStartManualEntry: (patient: Patient, inst: InstrumentDef, ctx: { sessionNumber?: number }) => void;
}) {
  return (
    <div className="rounded-lg px-3 py-3 mb-2" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-full shrink-0" style={{ width: 11, height: 11, background: patient.color }} />
        <button type="button" onClick={() => onOpenPatient(patient.id)} className="font-semibold text-sm"
          style={{ color: C.ink, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {patient.name}
        </button>
        <StatusBadge status={patient.status} />
      </div>
      <SessionMonitoringPanel
        patient={patient}
        instruments={instruments}
        therapists={therapists}
        user={user}
        configured={configured}
        variant="monitoring"
        onPatientUpdated={onPatientUpdated}
        onStartManualEntry={(inst, ctx) => onStartManualEntry(patient, inst, ctx)}
      />
    </div>
  );
}

/// Per-therapist questionnaire monitoring: every invitation/task across the
/// caseload with completion status, overdue flags, reminder schedules, and the
/// full per-patient session+questionnaire panel. Directors see all caseloads.
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
  // Manual paper-form entry launched from a patient block — takes over the
  // whole view with the clinician InstrumentForm. Carries the session number
  // when started from the after-session send step, so the entry lands on the
  // right ledger row.
  const [manualEntry, setManualEntry] = useState<{ patient: Patient; instrument: InstrumentDef; sessionNumber?: number } | null>(null);
  const now = new Date();
  const configured = data.limesurveyConfigured;

  // Concluded treatments are read-only — they don't belong in questionnaire
  // monitoring (and must not receive new questionnaires).
  const active = data.patients.filter((p) => p.status !== "archived");
  const scoped = isDirector ? active : active.filter((p) => p.therapistId === user.id);
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

  if (manualEntry) {
    return (
      <InstrumentForm
        instrument={manualEntry.instrument}
        clinicianMode
        therapists={data.therapists}
        defaultConductedById={user.role === "therapist" ? user.id : manualEntry.patient.therapistId}
        defaultSessionNumber={manualEntry.sessionNumber}
        busy={busy}
        onCancel={() => setManualEntry(null)}
        onSubmit={async (payload) => {
          setBusy(true);
          try {
            const r = await api.submitResponse(manualEntry.patient.id, payload);
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
            <PatientBlock key={p.id} patient={p} instruments={data.instruments} therapists={data.therapists}
              user={user} configured={configured}
              onOpenPatient={onOpenPatient} onPatientUpdated={onPatientUpdated}
              onStartManualEntry={(patient, instrument, ctx) => setManualEntry({ patient, instrument, sessionNumber: ctx.sessionNumber })} />
          ))}
        </Card>
      ))}
    </div>
  );
}
