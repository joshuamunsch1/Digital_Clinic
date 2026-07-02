"use client";
import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { C } from "@/lib/theme";
import { composite } from "@/lib/wellbeing";
import { fmtDate } from "@/lib/format";
import type { Patient, Therapist } from "@/lib/types";
import { Card, PrimaryButton, SectionTitle } from "./ui";
import { ChartTip } from "./charts";

type FormName = "assessment" | "wellbeing";

export function PatientHome({ patient, therapist, onStartForm, justSubmitted }: { patient: Patient; therapist?: Therapist; onStartForm: (f: FormName) => void; justSubmitted: boolean }) {
  const idxRows = patient.entries.map((e) => ({ session: e.session, index: composite(e.scores) }));
  const sub = patient.dips && patient.dips.submission;
  const tasks: Record<string, { title: string; desc: string; cta: string; form: FormName } | null> = {
    assessment: { title: "Intake & DIPS anxiety screening", desc: "Please complete this before your first appointment. It includes a short personal section and a structured anxiety screening in your language.", cta: "Start intake", form: "assessment" },
    interview: null,
    therapy: { title: "Post-session wellbeing check-in", desc: "Please fill this out after each therapy session so your therapist can follow how you are doing.", cta: "Start check-in", form: "wellbeing" },
  };
  const task = tasks[patient.status];

  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle sub={therapist ? `Your therapist: ${therapist.name}` : "You will be introduced to your therapist soon."}>Welcome, {patient.name.split(" ")[0]}</SectionTitle>
      {justSubmitted && (
        <Card className="p-4 mb-4" style={{ background: C.spruceSoft, border: `1px solid ${C.spruce}` }}>
          <p className="text-sm font-semibold" style={{ color: C.spruce }}>Thank you — your answers were saved and shared with the clinic.</p>
        </Card>
      )}
      {task ? (
        <Card className="p-5 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>To do</span>
              <h3 className="lc-display text-xl mt-1" style={{ color: C.ink }}>{task.title}</h3>
              <p className="text-sm mt-1" style={{ color: C.muted }}>{task.desc}</p>
            </div>
            <PrimaryButton onClick={() => onStartForm(task.form)}>{task.cta}</PrimaryButton>
          </div>
        </Card>
      ) : (
        <Card className="p-5 mb-4">
          <h3 className="lc-display text-xl" style={{ color: C.ink }}>Nothing to fill out right now</h3>
          <p className="text-sm mt-1" style={{ color: C.muted }}>Your intake has been received. The clinic will contact you to arrange your interview; after therapy begins you will find your check-ins here.</p>
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
