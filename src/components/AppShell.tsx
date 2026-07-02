"use client";
import React, { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { api } from "@/lib/api-client";
import type { ClinicData, Patient, Role, SessionUser, LoginRoster } from "@/lib/types";
import { GhostButton, LeafMark } from "./ui";
import { Login } from "./Login";
import { PatientHome, type PatientTask } from "./PatientHome";
import { AssessmentForm, type AssessmentPayload } from "./AssessmentForm";
import { InstrumentForm } from "./InstrumentForm";
import { Dashboard } from "./Dashboard";
import { PatientDetail } from "./PatientDetail";

type View =
  | { name: "home" }
  | { name: "form-assessment" }
  | { name: "form-instrument"; instrumentId: string }
  | { name: "patient-detail"; patientId: string };

export function AppShell() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [data, setData] = useState<ClinicData | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await api.getClinic();
      setData(d);
    } catch {
      setData(null);
    }
  }, []);

  // Login screen needs the patient/therapist lists too; fetch them unauthenticated-friendly
  // by attempting a clinic fetch once a session exists, else a lightweight public list.
  const [loginData, setLoginData] = useState<LoginRoster | null>(null);
  const loadLoginData = useCallback(async () => {
    try {
      const d = await api.getRoster();
      setLoginData(d);
    } catch {
      setLoginData({ patients: [], therapists: [], directors: [] });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user: u } = await api.getSession();
        if (u) {
          setUser(u);
          await refresh();
        } else {
          await loadLoginData();
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [refresh, loadLoginData]);

  const doLogin = async (role: Role, id: string) => {
    setBusy(true);
    try {
      const { user: u } = await api.login(role, id);
      setUser(u);
      setView({ name: "home" });
      setJustSubmitted(false);
      await refresh();
    } catch (e) {
      alert("Sign-in failed: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    await api.logout();
    setUser(null);
    setData(null);
    setView({ name: "home" });
    await loadLoginData();
  };

  const submitAssessment = async (patientId: string, payload: AssessmentPayload) => {
    setBusy(true);
    try {
      await api.submitAssessment(patientId, payload.demo, payload.dips);
      await refresh();
      setJustSubmitted(true);
      setView({ name: "home" });
    } catch (e) {
      alert("Could not submit: " + (e as Error).message);
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
      alert("Could not submit: " + (e as Error).message);
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

  const saveDiagnosis = async (id: string, text: string) => { await api.saveDiagnosis(id, text); await refresh(); };
  const assignTherapist = async (id: string, therapistId: string | null) => { await api.assignTherapist(id, therapistId); await refresh(); };
  const registerPatient = async (name: string) => { await api.registerPatient(name); await refresh(); await loadLoginData(); };
  const resendDips = async (id: string) => { await api.resendDips(id); await refresh(); };
  const resetDemo = async () => {
    await api.resetDemo();
    setConfirmReset(false);
    await doLogout();
  };

  if (booting)
    return <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}><p className="text-sm" style={{ color: C.muted }}>Loading clinic data…</p></div>;

  if (!user)
    return <Login roster={loginData ?? { patients: [], therapists: [], directors: [] }} onLogin={doLogin} busy={busy} />;

  const currentPatient = user.role === "patient" ? data?.patients.find((p) => p.id === user.id) ?? null : null;
  const detailPatient = view.name === "patient-detail" ? data?.patients.find((p) => p.id === view.patientId) ?? null : null;
  const roleLabel = { patient: "Patient", therapist: "Therapist", director: "Clinic director" }[user.role];
  const therapists = data?.therapists ?? [];
  const instruments = data?.instruments ?? [];
  const formInstrument =
    view.name === "form-instrument" ? instruments.find((i) => i.id === view.instrumentId) ?? null : null;

  const startPatientTask = (t: PatientTask) => {
    setJustSubmitted(false);
    setView(t.kind === "assessment" ? { name: "form-assessment" } : { name: "form-instrument", instrumentId: t.instrumentId });
  };

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink }}>
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2"><LeafMark size={26} /><span className="lc-display text-lg" style={{ color: C.ink }}>Volksklinik</span></div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: C.spruceSoft, color: C.spruce }}>{roleLabel}</span>
          <span className="text-sm" style={{ color: C.muted }}>{user.name}</span>
          <div className="ml-auto flex items-center gap-2">
            {confirmReset ? (
              <>
                <button type="button" onClick={resetDemo} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: C.danger, color: "#fff", border: "none", cursor: "pointer" }}>Confirm reset</button>
                <GhostButton small onClick={() => setConfirmReset(false)}>Cancel</GhostButton>
              </>
            ) : (
              <GhostButton small onClick={() => setConfirmReset(true)}>Reset demo data</GhostButton>
            )}
            <GhostButton small onClick={doLogout}>Sign out</GhostButton>
          </div>
        </div>
      </header>
      <main className="px-4 py-6">
        {data == null && <p className="text-sm text-center" style={{ color: C.muted }}>Loading…</p>}

        {user.role === "patient" && currentPatient && view.name === "home" && (
          <PatientHome patient={currentPatient} therapist={therapists.find((t) => t.id === currentPatient.therapistId)} instruments={instruments} justSubmitted={justSubmitted} onStartTask={startPatientTask} />
        )}
        {user.role === "patient" && currentPatient && view.name === "form-assessment" && (
          <AssessmentForm onCancel={() => setView({ name: "home" })} onSubmit={(payload) => submitAssessment(currentPatient.id, payload)} />
        )}
        {user.role === "patient" && currentPatient && formInstrument && (
          <InstrumentForm
            instrument={formInstrument}
            busy={busy}
            onCancel={() => setView({ name: "home" })}
            onSubmit={(payload) => submitResponse(currentPatient.id, payload)}
          />
        )}

        {(user.role === "therapist" || user.role === "director") && data && view.name === "home" && (
          <Dashboard data={data} user={user} onOpenPatient={(id) => setView({ name: "patient-detail", patientId: id })} onAssign={assignTherapist} onRegisterPatient={registerPatient} />
        )}
        {(user.role === "therapist" || user.role === "director") && detailPatient && (
          <PatientDetail patient={detailPatient} user={user} therapists={therapists} instruments={instruments} onBack={() => setView({ name: "home" })} onAssign={assignTherapist} onSaveDiagnosis={saveDiagnosis} onResend={resendDips} onPatientUpdated={patientUpdated} />
        )}
      </main>
      <footer className="px-4 pb-8 pt-2 text-center">
        <p className="text-xs" style={{ color: C.muted }}>Prototype with fictional demo data · DIPS Open Access content for demonstration · not for real patient records</p>
      </footer>
    </div>
  );
}
