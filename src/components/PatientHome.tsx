"use client";
import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import type { Patient, Therapist } from "@/lib/types";
import { checkinSeries, CHECKIN_PRIMARY_SCALE, responsesFor } from "@/lib/types";
import { isFillable, type InstrumentDef } from "@/lib/instruments/types";
import { Card, PrimaryButton, SectionTitle } from "./ui";
import { ChartTip } from "./charts";

export type PatientTask = { kind: "assessment" } | { kind: "instrument"; instrumentId: string };

/// Instruments a patient can fill out in-app: complete definition AND full item
/// wording available (licensed instruments only carry item codes, so those are
/// administered via LimeSurvey or entered by the therapist instead).
export function patientFillable(instruments: InstrumentDef[]): InstrumentDef[] {
  return instruments.filter(
    (i) => i.instrumentType === "likert_battery" && isFillable(i) && i.items.every((it) => it.text),
  );
}

export function PatientHome({ patient, therapist, instruments, onStartTask, justSubmitted }: {
  patient: Patient;
  therapist?: Therapist;
  instruments: InstrumentDef[];
  onStartTask: (t: PatientTask) => void;
  justSubmitted: boolean;
}) {
  const series = checkinSeries(patient);
  const idxRows = series
    .filter((r) => r.scores[CHECKIN_PRIMARY_SCALE] !== undefined)
    .map((r) => ({ session: r.sessionNumber, index: Math.round(r.scores[CHECKIN_PRIMARY_SCALE]) }));
  const sub = patient.dips && patient.dips.submission;

  const fillable = patientFillable(instruments);
  const dueInstruments =
    patient.status === "therapy" ? fillable.filter((i) => i.cadenceType === "every_session") : [];
  const optionalInstruments =
    patient.status === "therapy"
      ? fillable.filter((i) => i.cadenceType !== "every_session" && i.raterRole === "self")
      : [];

  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle sub={therapist ? `Your therapist: ${therapist.name}` : "You will be introduced to your therapist soon."}>Welcome, {patient.name.split(" ")[0]}</SectionTitle>
      {justSubmitted && (
        <Card className="p-4 mb-4" style={{ background: C.spruceSoft, border: `1px solid ${C.spruce}` }}>
          <p className="text-sm font-semibold" style={{ color: C.spruce }}>Thank you — your answers were saved and shared with the clinic.</p>
        </Card>
      )}

      {patient.status === "assessment" && (
        <Card className="p-5 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>To do</span>
              <h3 className="lc-display text-xl mt-1" style={{ color: C.ink }}>Intake & DIPS anxiety screening</h3>
              <p className="text-sm mt-1" style={{ color: C.muted }}>Please complete this before your first appointment. It includes a short personal section and a structured anxiety screening in your language.</p>
            </div>
            <PrimaryButton onClick={() => onStartTask({ kind: "assessment" })}>Start intake</PrimaryButton>
          </div>
        </Card>
      )}

      {dueInstruments.map((inst) => (
        <Card key={inst.id} className="p-5 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>To do after each session</span>
              <h3 className="lc-display text-xl mt-1" style={{ color: C.ink }}>{inst.name}</h3>
              <p className="text-sm mt-1" style={{ color: C.muted }}>Please fill this out after each therapy session so your therapist can follow how you are doing.</p>
            </div>
            <PrimaryButton onClick={() => onStartTask({ kind: "instrument", instrumentId: inst.id })}>Start check-in</PrimaryButton>
          </div>
        </Card>
      ))}

      {patient.status === "interview" && (
        <Card className="p-5 mb-4">
          <h3 className="lc-display text-xl" style={{ color: C.ink }}>Nothing to fill out right now</h3>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Your intake has been received. The clinic will contact you to arrange your interview; after therapy begins you will find your check-ins here.</p>
        </Card>
      )}

      {optionalInstruments.length > 0 && (
        <Card className="p-5 mb-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: C.spruce }}>Other questionnaires</h3>
          <p className="text-xs mb-3" style={{ color: C.muted }}>Only fill these out if your therapist asked you to.</p>
          <div className="flex flex-col gap-2">
            {optionalInstruments.map((inst) => {
              const done = responsesFor(patient, inst.id).length;
              return (
                <div key={inst.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.ink }}>{inst.name}</p>
                    {done > 0 && <p className="text-xs" style={{ color: C.muted }}>Filled out {done}×</p>}
                  </div>
                  <PrimaryButton small onClick={() => onStartTask({ kind: "instrument", instrumentId: inst.id })}>Fill out</PrimaryButton>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {idxRows.length >= 2 && (
        <Card className="p-5 mb-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: C.spruce }}>Your wellbeing over time</h3>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={idxRows} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="session" tickFormatter={(s: number) => (s === 0 ? "B" : `S${s}`)} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} stroke={C.line} />
                <Tooltip content={<ChartTip />} />
                <Area dataKey="index" name="Wellbeing index" stroke={C.spruce} strokeWidth={2.5} fill={C.spruceSoft} type="monotone" isAnimationActive={false} dot={{ r: 2.5, fill: C.spruce, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      {sub && (
        <Card className="p-4">
          <p className="text-xs" style={{ color: C.muted }}>Intake submission: {sub.status === "sent" ? `delivered (${sub.at ? fmtDate(sub.at) : "recently"})` : "saved, awaiting delivery"}.</p>
        </Card>
      )}
    </div>
  );
}
