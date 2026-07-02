"use client";
import React, { useState } from "react";
import { C } from "@/lib/theme";
import type { ClinicData, SessionUser } from "@/lib/types";
import { latestCheckinIndex } from "@/lib/types";
import { Card, PrimaryButton, SectionTitle, Stat, StatusBadge, TrendArrow } from "./ui";
import { GlobalChart } from "./charts";

export function Dashboard({ data, user, onOpenPatient, onAssign, onRegisterPatient }: {
  data: ClinicData; user: SessionUser;
  onOpenPatient: (id: string) => void;
  onAssign: (id: string, therapistId: string | null) => void;
  onRegisterPatient: (name: string) => void;
}) {
  const isDirector = user.role === "director";
  const patients = isDirector ? data.patients : data.patients.filter((p) => p.therapistId === user.id);
  const inTherapy = patients.filter((p) => p.status === "therapy");
  const awaiting = patients.filter((p) => p.status === "interview");
  const withIdx = inTherapy.map(latestCheckinIndex).filter((v): v is number => v !== null);
  const avgIdx = withIdx.length ? Math.round(withIdx.reduce((s, v) => s + v, 0) / withIdx.length) : "—";
  const [newName, setNewName] = useState("");
  return (
    <div className="max-w-5xl mx-auto">
      <SectionTitle sub={isDirector ? "All patients and therapists of the clinic" : "Patients assigned to you"}>{isDirector ? "Clinic overview" : "My patients"}</SectionTitle>
      <div className="flex gap-3 mb-5 flex-wrap">
        <Stat label="Patients" value={patients.length} />
        <Stat label="In therapy" value={inTherapy.length} />
        <Stat label="Awaiting intake" value={awaiting.length} />
        <Stat label="Avg. wellbeing index" value={avgIdx} />
      </div>
      <Card className="p-5 mb-5">
        <SectionTitle sub="Composite wellbeing index per patient across sessions. Updates whenever a check-in is submitted.">Patient development</SectionTitle>
        <GlobalChart patients={patients} />
      </Card>
      <Card className="p-5 mb-5">
        <SectionTitle>Patients</SectionTitle>
        <div className="flex flex-col gap-2">
          {patients.length === 0 && <p className="text-sm" style={{ color: C.muted }}>No patients assigned to you yet.</p>}
          {patients.map((p) => {
            const t = data.therapists.find((x) => x.id === p.therapistId);
            const last = latestCheckinIndex(p);
            return (
              <button key={p.id} type="button" onClick={() => onOpenPatient(p.id)} className="w-full text-left rounded-lg px-3 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, cursor: "pointer" }}>
                <span className="rounded-full shrink-0" style={{ width: 11, height: 11, background: p.color }} />
                <span className="font-semibold text-sm" style={{ color: C.ink, minWidth: 130 }}>{p.name}</span>
                <StatusBadge status={p.status} />
                <span className="text-xs" style={{ color: C.muted }}>{isDirector ? (t ? t.name : "Unassigned") : ""}{!t && isDirector && <strong style={{ color: C.amber }}> ← assign</strong>}</span>
                <span className="ml-auto text-sm font-bold flex items-center gap-1" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                  {last !== null ? <>{last} <TrendArrow patient={p} /></> : <span style={{ color: C.muted }}>—</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      {isDirector && (
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="p-5">
            <SectionTitle sub="Caseload per therapist">Therapists</SectionTitle>
            <div className="flex flex-col gap-2">
              {data.therapists.map((t) => {
                const n = data.patients.filter((p) => p.therapistId === t.id).length;
                return (
                  <div key={t.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                    <div><p className="text-sm font-semibold" style={{ color: C.ink }}>{t.name}</p><p className="text-xs" style={{ color: C.muted }}>{t.title}</p></div>
                    <span className="text-sm font-bold" style={{ color: C.spruce, fontVariantNumeric: "tabular-nums" }}>{n} patient{n === 1 ? "" : "s"}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle sub="New patients start with the intake (DIPS anxiety screening) and can then be assigned.">Register a new patient</SectionTitle>
            <div className="flex gap-2">
              <input style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14, border: `1px solid ${C.line}`, background: C.surface, color: C.ink }} placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <PrimaryButton small disabled={!newName.trim()} onClick={() => { onRegisterPatient(newName.trim()); setNewName(""); }}>Register</PrimaryButton>
            </div>
            <p className="text-xs mt-2" style={{ color: C.muted }}>The new patient appears on the sign-in screen so you can try their intake flow.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
