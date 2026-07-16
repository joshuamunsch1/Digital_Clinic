"use client";
import React, { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { api } from "@/lib/api-client";
import type { ClinicData, Patient, SessionUser } from "@/lib/types";
import { GhostButton, LeafMark } from "./ui";
import { Login, type RegisterPayload } from "./Login";
import { PatientHome, type PatientTask } from "./PatientHome";
import { AssessmentForm, type AssessmentPayload } from "./AssessmentForm";
import { DiagnosisView } from "./DiagnosisView";
import { DipsForm, type DipsSubmission } from "./DipsForm";
import { GoalsView } from "./GoalsView";
import { IntakeEditView } from "./IntakeEditView";
import { InstrumentForm } from "./InstrumentForm";
import { Dashboard } from "./Dashboard";
import { MonitoringView } from "./MonitoringView";
import { PatientDetail } from "./PatientDetail";
import { ArchiveView } from "./ArchiveView";
import { LangProvider, LangSwitcher, useT } from "./LangContext";
import type { RegisterPatientPayload } from "@/lib/api-client";

type View =
  | { name: "home" }
  | { name: "form-assessment" }
  | { name: "form-instrument"; instrumentId: string; invitationId?: string }
  | { name: "archive" }
  | { name: "monitoring" }
  // Therapist-administered DIPS interview for one patient (staff-only).
  | { name: "dips-interview"; patientId: string }
  // Full-window diagnostics: DIPS evaluation, proposal, recommendations, guidelines.
  | { name: "diagnosis"; patientId: string }
  // Staff editor for the once-per-treatment intake data (demographics + predictors).
  | { name: "intake-edit"; patientId: string }
  // Full-window GAS therapy goals: ladder cards, attainment ratings, trajectory.
  | { name: "goals"; patientId: string }
  // from makes Back return to the originating secondary view instead of the dashboard.
  | { name: "patient-detail"; patientId: string; from?: "monitoring" | "archive" };

export function AppShell() {
  return (
    <LangProvider>
      <Shell />
    </LangProvider>
  );
}

function Shell() {
  const t = useT();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [data, setData] = useState<ClinicData | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [networkBlocked, setNetworkBlocked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await api.getClinic();
      // Archived patients arrive as summary rows (no responses) to keep the
      // clinic payload small; keep any full dossier we already fetched instead
      // of clobbering it with the summary.
      setData((prev) => {
        if (!prev) return d;
        return {
          ...d,
          patients: d.patients.map((np) => {
            const old = prev.patients.find((x) => x.id === np.id);
            return np.status === "archived" && np.responses.length === 0 && old && old.responses.length > 0
              ? { ...np, responses: old.responses, invitations: old.invitations, sessionLogs: old.sessionLogs, goals: old.goals, dips: old.dips }
              : np;
          }),
        };
      });
      setNetworkBlocked(false);
    } catch (e) {
      setData(null);
      setNetworkBlocked((e as Error).message === "network_restricted");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user: u } = await api.getSession();
        if (u) {
          setUser(u);
          await refresh();
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [refresh]);

  const doLogin = async (email: string, password: string) => {
    setBusy(true);
    try {
      const { user: u } = await api.login(email, password);
      setUser(u);
      setView({ name: "home" });
      setJustSubmitted(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (payload: RegisterPayload) => {
    setBusy(true);
    try {
      const { user: u } = await api.register(payload);
      setUser(u);
      setView({ name: "home" });
      setJustSubmitted(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    await api.logout();
    setUser(null);
    setData(null);
    setNetworkBlocked(false);
    setView({ name: "home" });
  };

  const submitAssessment = async (patientId: string, payload: AssessmentPayload) => {
    setBusy(true);
    try {
      await api.submitAssessment(patientId, payload.demo);
      await refresh();
      setJustSubmitted(true);
      setView({ name: "home" });
    } catch (e) {
      alert("✗ " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitDips = async (patientId: string, dips: DipsSubmission) => {
    setBusy(true);
    try {
      const r = await api.submitDips(patientId, dips);
      patientUpdated(r.patient);
      setView({ name: "patient-detail", patientId });
    } catch (e) {
      alert("✗ " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitResponse = async (patientId: string, payload: Parameters<typeof api.submitResponse>[1]) => {
    setBusy(true);
    try {
      await api.submitResponse(patientId, payload);
      await refresh();
      setJustSubmitted(true);
      setView({ name: "home" });
    } catch (e) {
      alert("✗ " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /// Merge a fresh patient payload returned by an API call into clinic state
  /// (used by the patient-detail panels), then refresh in the background so
  /// instrument metadata stays current too.
  const patientUpdated = (p: Patient) => {
    setData((prev) => (prev ? { ...prev, patients: prev.patients.map((x) => (x.id === p.id ? p : x)) } : prev));
    void refresh();
  };

  /// Archived dossiers are summary-only in the clinic payload — load the full
  /// record once when one is opened.
  const openedDetailRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (view.name !== "patient-detail") {
      openedDetailRef.current = null;
      return;
    }
    if (openedDetailRef.current === view.patientId) return;
    openedDetailRef.current = view.patientId;
    const p = data?.patients.find((x) => x.id === view.patientId);
    if (!p || p.status !== "archived" || p.responses.length > 0) return;
    void api
      .getPatient(view.patientId)
      .then((r) =>
        setData((prev) =>
          prev ? { ...prev, patients: prev.patients.map((x) => (x.id === r.patient.id ? r.patient : x)) } : prev,
        ),
      )
      .catch(() => {});
  }, [view, data]);

  const saveDiagnosis = async (id: string, text: string, category: string, icdCode?: string) => {
    await api.saveDiagnosis(id, text, category, icdCode);
    await refresh();
  };
  const assignTherapist = async (id: string, therapistId: string | null) => { await api.assignTherapist(id, therapistId); await refresh(); };
  // Errors propagate to the Dashboard registration card (e.g. email_taken).
  const registerPatient = async (payload: RegisterPatientPayload) => { await api.registerPatient(payload); await refresh(); };
  const resendDips = async (id: string) => { await api.resendDips(id); await refresh(); };
  const resetDemo = async () => {
    await api.resetDemo();
    setConfirmReset(false);
    await doLogout();
  };

  if (booting)
    return <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}><p className="text-sm" style={{ color: C.muted }}>{t("loadingClinic")}</p></div>;

  if (!user)
    return <Login onLogin={doLogin} onRegister={doRegister} busy={busy} />;

  const currentPatient = user.role === "patient" ? data?.patients.find((p) => p.id === user.id) ?? null : null;
  const detailPatient = view.name === "patient-detail" ? data?.patients.find((p) => p.id === view.patientId) ?? null : null;
  const roleLabel = {
    patient: t("rolePatient"),
    therapist: t("roleTherapist"),
    director: t("roleDirector"),
    admin: t("roleAdmin"),
  }[user.role];
  const therapists = data?.therapists ?? [];
  const instruments = data?.instruments ?? [];
  const formInstrument =
    view.name === "form-instrument" ? instruments.find((i) => i.id === view.instrumentId) ?? null : null;

  const startPatientTask = (task: PatientTask) => {
    setJustSubmitted(false);
    setView(
      task.kind === "assessment"
        ? { name: "form-assessment" }
        : { name: "form-instrument", instrumentId: task.instrumentId, invitationId: task.invitationId },
    );
  };

  const isStaff = user.role !== "patient";

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink }}>
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2"><LeafMark size={26} /><span className="lc-display text-lg" style={{ color: C.ink }}>Volksklinik</span></div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: C.spruceSoft, color: C.spruce }}>{roleLabel}</span>
          <span className="text-sm" style={{ color: C.muted }}>{user.name}</span>
          <div className="ml-auto flex items-center gap-2">
            <LangSwitcher compact />
            {confirmReset ? (
              <>
                <button type="button" onClick={resetDemo} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: C.danger, color: "#fff", border: "none", cursor: "pointer" }}>{t("confirmReset")}</button>
                <GhostButton small onClick={() => setConfirmReset(false)}>{t("cancel")}</GhostButton>
              </>
            ) : (
              <GhostButton small onClick={() => setConfirmReset(true)}>{t("resetDemo")}</GhostButton>
            )}
            <GhostButton small onClick={doLogout}>{t("signOut")}</GhostButton>
          </div>
        </div>
      </header>
      <main className="px-4 py-6">
        {networkBlocked && isStaff && (
          <div className="max-w-3xl mx-auto mb-4 rounded-xl p-4" style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
            <p className="text-sm font-semibold" style={{ color: C.amber }}>{t("networkRestricted")}</p>
          </div>
        )}
        {data == null && !networkBlocked && <p className="text-sm text-center" style={{ color: C.muted }}>{t("loading")}</p>}

        {user.role === "patient" && currentPatient && view.name === "home" && (
          <PatientHome patient={currentPatient} therapist={therapists.find((th) => th.id === currentPatient.therapistId)} instruments={instruments} justSubmitted={justSubmitted} onStartTask={startPatientTask} />
        )}
        {user.role === "patient" && currentPatient && view.name === "form-assessment" && (
          <AssessmentForm onCancel={() => setView({ name: "home" })} onSubmit={(payload) => submitAssessment(currentPatient.id, payload)} />
        )}
        {user.role === "patient" && currentPatient && formInstrument && (
          <InstrumentForm
            instrument={formInstrument}
            busy={busy}
            onCancel={() => setView({ name: "home" })}
            onSubmit={(payload) =>
              submitResponse(currentPatient.id, {
                ...payload,
                invitationId: view.name === "form-instrument" ? view.invitationId : undefined,
              })
            }
          />
        )}

        {isStaff && data && view.name === "home" && (
          <Dashboard data={data} user={user} onOpenPatient={(id) => setView({ name: "patient-detail", patientId: id })} onAssign={assignTherapist} onRegisterPatient={registerPatient}
            onOpenMonitoring={user.role === "therapist" || user.role === "director" ? () => setView({ name: "monitoring" }) : undefined}
            onOpenArchive={() => setView({ name: "archive" })} />
        )}
        {(user.role === "therapist" || user.role === "director") && data && view.name === "dips-interview" && (() => {
          const dipsPatient = data.patients.find((p) => p.id === view.patientId);
          return dipsPatient ? (
            <DipsForm
              heading={t("dipsInterviewTitle", { name: dipsPatient.name })}
              intro={t("dipsInterviewIntro")}
              submitLabel={t("dipsSubmit")}
              busy={busy}
              onSubmit={(dips) => void submitDips(dipsPatient.id, dips)}
              onCancel={() => setView({ name: "patient-detail", patientId: view.patientId })}
            />
          ) : null;
        })()}
        {(user.role === "therapist" || user.role === "director") && data && view.name === "diagnosis" && (() => {
          const diagPatient = data.patients.find((p) => p.id === view.patientId);
          return diagPatient ? (
            <DiagnosisView patient={diagPatient} therapists={therapists} instruments={instruments}
              onBack={() => setView({ name: "patient-detail", patientId: view.patientId })}
              onSaveDiagnosis={saveDiagnosis}
              onStartDips={(id) => setView({ name: "dips-interview", patientId: id })}
              onResend={resendDips} />
          ) : null;
        })()}
        {(user.role === "therapist" || user.role === "director") && data && view.name === "intake-edit" && (() => {
          const intakePatient = data.patients.find((p) => p.id === view.patientId);
          return intakePatient ? (
            <IntakeEditView patient={intakePatient}
              onBack={() => setView({ name: "patient-detail", patientId: view.patientId })}
              onSaved={patientUpdated} />
          ) : null;
        })()}
        {(user.role === "therapist" || user.role === "director") && data && view.name === "goals" && (() => {
          const goalsPatient = data.patients.find((p) => p.id === view.patientId);
          return goalsPatient ? (
            <GoalsView patient={goalsPatient} user={user}
              onBack={() => setView({ name: "patient-detail", patientId: view.patientId })}
              onPatientUpdated={patientUpdated} />
          ) : null;
        })()}
        {(user.role === "therapist" || user.role === "director") && data && view.name === "monitoring" && (
          <MonitoringView data={data} user={user} onBack={() => setView({ name: "home" })}
            onOpenPatient={(id) => setView({ name: "patient-detail", patientId: id, from: "monitoring" })}
            onPatientUpdated={patientUpdated} onRefreshAll={() => void refresh()} />
        )}
        {(user.role === "therapist" || user.role === "director") && data && view.name === "archive" && (
          <ArchiveView data={data} user={user} onOpenPatient={(id) => setView({ name: "patient-detail", patientId: id, from: "archive" })} onBack={() => setView({ name: "home" })} />
        )}
        {(user.role === "therapist" || user.role === "director") && detailPatient && (
          <PatientDetail patient={detailPatient} user={user} therapists={therapists} instruments={instruments}
            onBack={() =>
              setView(
                view.name === "patient-detail" && view.from === "monitoring"
                  ? { name: "monitoring" }
                  : view.name === "patient-detail" && view.from === "archive"
                    ? { name: "archive" }
                    : { name: "home" },
              )
            }
            onAssign={assignTherapist} onSaveDiagnosis={saveDiagnosis} onPatientUpdated={patientUpdated}
            onStartDips={(id) => setView({ name: "dips-interview", patientId: id })}
            onOpenDiagnosis={(id) => setView({ name: "diagnosis", patientId: id })}
            onEditIntake={(id) => setView({ name: "intake-edit", patientId: id })}
            onOpenGoals={(id) => setView({ name: "goals", patientId: id })} />
        )}
      </main>
      <footer className="px-4 pb-8 pt-2 text-center">
        <p className="text-xs" style={{ color: C.muted }}>{t("loginFooter")}</p>
      </footer>
    </div>
  );
}
