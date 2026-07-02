"use client";
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { DIMS, WELLBEING_NOTE_LABEL, type DimKey, type Scores } from "@/lib/wellbeing";
import type { Patient } from "@/lib/types";
import { Card, Field, GhostButton, PrimaryButton, ScaleInput, SectionTitle } from "./ui";

function emptyScores(): Record<DimKey, number | null> {
  const s = {} as Record<DimKey, number | null>;
  DIMS.forEach((d) => (s[d.key] = null));
  return s;
}

export function WellbeingForm({ patient, onSubmit, onCancel }: { patient: Patient; onSubmit: (p: { scores: Scores; note: string }) => void; onCancel: () => void }) {
  const [scores, setScores] = useState<Record<DimKey, number | null>>(emptyScores());
  const [note, setNote] = useState("");
  const ready = DIMS.every((d) => scores[d.key] !== null);
  const sessionNo = patient.entries.length ? patient.entries[patient.entries.length - 1].session + 1 : 1;
  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle sub={`Check-in after session ${sessionNo}. Thinking about the time since your last session.`}>Wellbeing check-in</SectionTitle>
      <Card className="p-5 mb-4">
        <div className="flex flex-col gap-5">
          {DIMS.map((d) => (
            <div key={d.key}>
              <p className="text-sm font-semibold mb-2" style={{ color: C.ink }}>{d.q}</p>
              <ScaleInput value={scores[d.key]} onChange={(v) => setScores({ ...scores, [d.key]: v })} />
            </div>
          ))}
          <Field label={WELLBEING_NOTE_LABEL}><textarea style={{ width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, resize: "vertical" }} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Card>
      <div className="flex gap-3 items-center">
        <PrimaryButton disabled={!ready} onClick={() => onSubmit({ scores: scores as Scores, note })}>Submit check-in</PrimaryButton>
        <GhostButton onClick={onCancel}>Back</GhostButton>
        {!ready && <span className="text-xs" style={{ color: C.muted }}>Please answer every scale.</span>}
      </div>
    </div>
  );
}
