"use client";
import React from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import type { Patient, Therapist } from "@/lib/types";
import { responsesFor } from "@/lib/types";
import { hasFullWording, isFillable, type InstrumentDef } from "@/lib/instruments/types";
import { Card, PrimaryButton, SectionTitle } from "./ui";
import { GoalLadder } from "./GoalLadder";
import { useT } from "./LangContext";

export type PatientTask =
  | { kind: "assessment" }
  | { kind: "instrument"; instrumentId: string; invitationId?: string };

/// Does this instrument's target population fit the patient? Age-based
/// heuristic over the catalog's population slugs ("adult", "child_adolescent",
/// "adult_adolescent", "all", …); unknown age defaults to the adult forms.
/// Exported for the send-after-session step (SessionMonitoringPanel).
export function populationMatches(inst: InstrumentDef, patient: Patient): boolean {
  if (inst.population === "all") return true;
  const age = Number(patient.demographics.age);
  if (!Number.isFinite(age)) return inst.population.includes("adult");
  return age < 18 ? /child|adolescent/.test(inst.population) : inst.population.includes("adult");
}

/// Instruments a patient can fill out in-app: complete definition, full item
/// wording available (licensed instruments only carry item codes, so those are
/// administered via LimeSurvey or entered by the therapist instead), and a
/// population that fits the patient (an adult must not see the SBKJ child form).
export function patientFillable(instruments: InstrumentDef[], patient?: Patient): InstrumentDef[] {
  return instruments.filter(
    (i) =>
      i.instrumentType === "likert_battery" &&
      isFillable(i) &&
      hasFullWording(i) &&
      (!patient || populationMatches(i, patient)),
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

  const fillable = patientFillable(instruments, patient);
  // Questionnaires the therapist explicitly requested in-app (open tasks).
  const requestedTasks = patient.invitations
    .filter((inv) => inv.channel === "in_app" && inv.status === "created")
    .flatMap((inv) => {
      const inst = fillable.find((i) => i.id === inv.instrumentId);
      return inst ? [{ inv, inst }] : [];
    });
  // Standing after-session cards stay as a fallback when the therapist skipped
  // the send step — but an open in-app request for the same instrument replaces
  // them (the requested task completes the invitation and carries the session
  // number, so it must win over the anonymous standing card).
  const requestedIds = new Set(requestedTasks.map(({ inst }) => inst.id));
  const dueInstruments =
    patient.status === "therapy"
      ? fillable.filter((i) => i.cadenceType === "every_session" && !requestedIds.has(i.id))
      : [];
  const optionalInstruments =
    patient.status === "therapy"
      ? fillable.filter((i) => i.cadenceType !== "every_session" && i.raterRole === "self")
      : [];

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

      {/* Demographics to-do is keyed on submission, not status — the DIPS or
          even the diagnosis can move the patient past "assessment" before the
          form is filled, and the task must stay visible until it is. */}
      {!patient.assessment && patient.status !== "archived" && (
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

      {patient.status === "interview" && patient.assessment && requestedTasks.length === 0 && (
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

      {/* GAS therapy goals, read-only: the patient sees the goals they set with
          their therapist (entry and attainment ratings are staff-side). */}
      {patient.goals.length > 0 && (
        <Card className="p-5 mb-4">
          <h3 className="text-sm font-bold mb-1" style={{ color: C.spruce }}>{t("goalsPatientTitle")}</h3>
          <p className="text-xs mb-3" style={{ color: C.muted }}>{t("goalsPatientHint")}</p>
          <div className="flex flex-col gap-4">
            {patient.goals.map((g) => (
              <GoalLadder key={g.id} goal={g} readOnly />
            ))}
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
