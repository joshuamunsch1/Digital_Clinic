"use client";
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { tr, T } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { composite } from "@/lib/wellbeing";
import type { Patient, SessionUser, Therapist } from "@/lib/types";
import { Card, GhostButton, PrimaryButton, StatusBadge, TrendArrow, inputStyle } from "./ui";
import { PatientChart } from "./charts";
import { DipsSummary } from "./DipsSummary";

export function PatientDetail({ patient, user, therapists, onBack, onAssign, onSaveDiagnosis, onResend }: {
  patient: Patient; user: SessionUser; therapists: Therapist[];
  onBack: () => void; onAssign: (id: string, therapistId: string | null) => void;
  onSaveDiagnosis: (id: string, text: string) => void; onResend: (id: string) => void;
}) {
  const therapist = therapists.find((t) => t.id === patient.therapistId);
  const [dxText, setDxText] = useState("");
  const last = patient.entries[patient.entries.length - 1];
  const lastIdx = last ? composite(last.scores) : null;
  const d = patient.demographics;
  const demoRows: [string, React.ReactNode][] = [["Age", d.age], ["Sex", d.sex], ["Nationality", d.nationality], ["Residence", d.city], ["Occupation", d.occupation], ["Living situation", d.living], ["Siblings", d.siblings]];
  const sub = patient.dips && patient.dips.submission;
  return (
    <div className="max-w-4xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3" style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>← Back to overview</button>
      <Card className="p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="rounded-full" style={{ width: 14, height: 14, background: patient.color }} />
            <div>
              <h2 className="lc-display text-2xl" style={{ color: C.ink }}>{patient.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge status={patient.status} />
                <span className="text-xs" style={{ color: C.muted }}>{patient.entries.length > 0 ? `${patient.entries.filter((e) => e.session > 0).length} session check-in(s)` : "no check-ins yet"}</span>
              </div>
            </div>
          </div>
          {lastIdx !== null && (
            <div className="text-right">
              <div className="text-3xl font-bold" style={{ color: C.spruce, fontVariantNumeric: "tabular-nums" }}>{lastIdx} <TrendArrow patient={patient} /></div>
              <div className="text-xs" style={{ color: C.muted }}>latest wellbeing index</div>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 flex items-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${C.line}` }}>
          <span className="text-sm font-semibold" style={{ color: C.ink }}>Therapist:</span>
          {user.role === "director" ? (
            <select style={{ ...inputStyle, width: "auto", minWidth: 200 }} value={patient.therapistId || ""} onChange={(e) => onAssign(patient.id, e.target.value || null)}>
              <option value="">Unassigned</option>
              {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <span className="text-sm" style={{ color: C.muted }}>{therapist ? therapist.name : "Unassigned"}</span>
          )}
          {!patient.therapistId && user.role === "director" && <span className="text-xs font-semibold" style={{ color: C.amber }}>Needs assignment</span>}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>Demographics & personal information</h3>
          {d && Object.keys(d).length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {demoRows.map(([k, v]) => (<React.Fragment key={k}><dt style={{ color: C.muted }}>{k}</dt><dd className="font-semibold" style={{ color: C.ink }}>{v || "—"}</dd></React.Fragment>))}
            </dl>
          ) : (<p className="text-sm" style={{ color: C.muted }}>The patient has not completed intake yet.</p>)}
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>Diagnosis</h3>
          {patient.diagnosis ? (
            <div><p className="text-sm font-semibold" style={{ color: C.ink }}>{patient.diagnosis.text}</p><p className="text-xs mt-1" style={{ color: C.muted }}>Recorded {fmtDate(patient.diagnosis.date)} · {patient.diagnosis.by}</p></div>
          ) : patient.status === "assessment" ? (
            <p className="text-sm" style={{ color: C.muted }}>A diagnosis is recorded after the intake interview.</p>
          ) : (
            <div>
              <p className="text-sm mb-2" style={{ color: C.muted }}>Intake received. Record the diagnosis from the interview to start therapy — the patient will then receive post-session check-ins.</p>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} placeholder="Diagnosis from intake interview…" value={dxText} onChange={(e) => setDxText(e.target.value)} />
              <div className="mt-2"><PrimaryButton small disabled={!dxText.trim()} onClick={() => onSaveDiagnosis(patient.id, dxText.trim())}>Save diagnosis & start therapy</PrimaryButton></div>
            </div>
          )}
        </Card>
      </div>

      {patient.dips && (
        <Card className="p-5 mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="text-sm font-bold" style={{ color: C.spruce }}>DIPS · Anxiety screening (self-report)</h3>
            {sub && sub.status !== "sent" && <GhostButton small onClick={() => onResend(patient.id)}>{tr(T.retry, "en")}</GhostButton>}
          </div>
          <DipsSummary patient={patient} />
        </Card>
      )}

      <Card className="p-5 mb-4"><h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>Wellbeing development</h3><PatientChart patient={patient} /></Card>

      {patient.entries.some((e) => e.note) && (
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>Patient notes from check-ins</h3>
          <div className="flex flex-col gap-2">
            {[...patient.entries].reverse().filter((e) => e.note).map((e) => (
              <div key={e.session} className="rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                <p className="text-xs font-bold" style={{ color: C.muted }}>Session {e.session} · {fmtDate(e.date)}</p>
                <p className="text-sm mt-0.5" style={{ color: C.ink }}>{e.note}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
