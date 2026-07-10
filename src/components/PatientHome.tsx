"use client";
import React from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import type { Patient, Therapist } from "@/lib/types";
import { responsesFor } from "@/lib/types";
import { hasFullWording, isFillable, type InstrumentDef } from "@/lib/instruments/types";
import { Card, PrimaryButton, SectionTitle } from "./ui";
import { useT } from "./LangContext";

export type PatientTask =
  | { kind: "assessment" }
  | { kind: "instrument"; instrumentId: string; invitationId?: string };

/// Instruments a patient can fill out in-app: complete definition AND full item
/// wording available (licensed instruments only carry item codes, so those are
/// administered via LimeSurvey or entered by the therapist instead).
export function patientFillable(instruments: InstrumentDef[]): InstrumentDef[] {
  return instruments.filter(
    (i) => i.instrumentType === "likert_battery" && isFillable(i) && hasFullWording(i),
  );
}

export function PatientHome({ patient, therapist, instruments, onStartTask, justSubmitted }: {
  patient: Patient;
  therapist?: Therapist;
  instruments: InstrumentDef[];
  onStartTask: (t: PatientTask) => void;
  justSubmitted: boolean;
}) {
  const t = useT();
  const sub = patient.dips && patient.dips.submission;

  const fillable = patientFillable(instruments);
  const dueInstruments =
    patient.status === "therapy" ? fillable.filter((i) => i.cadenceType === "every_session") : [];
  const optionalInstruments =
    patient.status === "therapy"
      ? fillable.filter((i) => i.cadenceType !== "every_session" && i.raterRole === "self")
      : [];
  // Questionnaires the therapist explicitly requested in-app (open tasks).
  const requestedTasks = patient.invitations
    .filter((inv) => inv.channel === "in_app" && inv.status === "created")
    .flatMap((inv) => {
      const inst = fillable.find((i) => i.id === inv.instrumentId);
      return inst ? [{ inv, inst }] : [];
    });

  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle sub={therapist ? t("yourTherapist", { name: therapist.name }) : t("introSoon")}>
        {t("welcome", { name: patient.name.split(" ")[0] })}
      </SectionTitle>
      {justSubmitted && (
        <Card className="p-4 mb-4" style={{ background: C.spruceSoft, border: `1px solid ${C.spruce}` }}>
          <p className="text-sm font-semibold" style={{ color: C.spruce }}>{t("thankYouSaved")}</p>
        </Card>
      )}

      {patient.status === "assessment" && (
        <Card className="p-5 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>{t("todo")}</span>
              <h3 className="lc-display text-xl mt-1" style={{ color: C.ink }}>{t("intakeTitle")}</h3>
              <p className="text-sm mt-1" style={{ color: C.muted }}>{t("intakeDesc")}</p>
            </div>
            <PrimaryButton onClick={() => onStartTask({ kind: "assessment" })}>{t("startIntake")}</PrimaryButton>
          </div>
        </Card>
      )}

      {requestedTasks.map(({ inv, inst }) => (
        <Card key={inv.id} className="p-5 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>{t("taskKicker")}</span>
              <h3 className="lc-display text-xl mt-1" style={{ color: C.ink }}>{inst.name}</h3>
              <p className="text-sm mt-1" style={{ color: C.muted }}>{t("taskLead")}</p>
              <p className="text-xs mt-1" style={{ color: C.muted }}>{t("taskRequestedOn", { date: fmtDate(inv.createdAt) })}</p>
            </div>
            <PrimaryButton onClick={() => onStartTask({ kind: "instrument", instrumentId: inst.id, invitationId: inv.id })}>
              {t("fillOut")}
            </PrimaryButton>
          </div>
        </Card>
      ))}

      {dueInstruments.map((inst) => (
        <Card key={inst.id} className="p-5 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.amber }}>{t("todoAfterSession")}</span>
              <h3 className="lc-display text-xl mt-1" style={{ color: C.ink }}>{inst.name}</h3>
              <p className="text-sm mt-1" style={{ color: C.muted }}>{t("sessionFormDesc")}</p>
            </div>
            <PrimaryButton onClick={() => onStartTask({ kind: "instrument", instrumentId: inst.id })}>{t("startSessionForm")}</PrimaryButton>
          </div>
        </Card>
      ))}

      {patient.status === "interview" && (
        <Card className="p-5 mb-4">
          <h3 className="lc-display text-xl" style={{ color: C.ink }}>{t("nothingTodo")}</h3>
          <p className="text-sm mt-1" style={{ color: C.muted }}>{t("nothingTodoDesc")}</p>
        </Card>
      )}

      {optionalInstruments.length > 0 && (
        <Card className="p-5 mb-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: C.spruce }}>{t("otherQuestionnaires")}</h3>
          <p className="text-xs mb-3" style={{ color: C.muted }}>{t("otherQuestionnairesHint")}</p>
          <div className="flex flex-col gap-2">
            {optionalInstruments.map((inst) => {
              const done = responsesFor(patient, inst.id).length;
              return (
                <div key={inst.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.ink }}>{inst.name}</p>
                    {done > 0 && <p className="text-xs" style={{ color: C.muted }}>{t("filledOutTimes", { n: done })}</p>}
                  </div>
                  <PrimaryButton small onClick={() => onStartTask({ kind: "instrument", instrumentId: inst.id })}>{t("fillOut")}</PrimaryButton>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {sub && (
        <Card className="p-4">
          <p className="text-xs" style={{ color: C.muted }}>
            {sub.status === "sent" ? t("intakeDelivered", { date: sub.at ? fmtDate(sub.at) : "—" }) : t("intakeSavedPending")}
          </p>
        </Card>
      )}
    </div>
  );
}
