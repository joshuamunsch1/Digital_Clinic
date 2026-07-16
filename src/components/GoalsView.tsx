"use client";
// Full-window GAS therapy-goals view (Zielerreichungsskala nach Kiresuk &
// Sherman): the attainment trajectory chart on top, one GoalLadder card per
// goal below, and the add/edit forms. Writes are restricted to the director or
// the assigned therapist on an active dossier — for everyone else (and for
// archived patients) the view renders read-only ladders.
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { api } from "@/lib/api-client";
import type { GoalLevelKey, GoalLevels, GoalRecord, Patient, SessionUser } from "@/lib/types";
import { GAS_LEVELS } from "@/lib/types";
import { Card, Field, GhostButton, PrimaryButton, SectionTitle, inputStyle } from "./ui";
import { GoalChart } from "./charts";
import { GoalLadder, fmtLevel } from "./GoalLadder";
import { useT } from "./LangContext";

/// Title + five level-description textareas, in ladder order (+3 … −1).
/// Shared by the add-goal card and the inline per-goal edit mode.
function GoalEditor({ initial, busy, onSave, onCancel }: {
  initial?: GoalRecord;
  busy: boolean;
  onSave: (title: string, levels: GoalLevels) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [levels, setLevels] = useState<GoalLevels>({ ...(initial?.levels ?? {}) });

  const captionOf = (lvl: number) =>
    lvl === 3 ? t("goalLevelPositive") : lvl === 0 ? t("goalLevelBaseline") : lvl === -1 ? t("goalLevelNegative") : "";

  return (
    <div>
      <Field label={t("goalTitleLabel")}>
        <input style={inputStyle} placeholder={t("goalTitlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="mt-3 flex flex-col gap-2">
        {GAS_LEVELS.map((lvl) => {
          const key = String(lvl) as GoalLevelKey;
          const caption = captionOf(lvl);
          return (
            <Field key={lvl} label={caption ? `${fmtLevel(lvl)} · ${caption}` : fmtLevel(lvl)}>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} placeholder={t("goalLevelDescPlaceholder")}
                value={levels[key] ?? ""} onChange={(e) => setLevels({ ...levels, [key]: e.target.value })} />
            </Field>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <PrimaryButton small disabled={busy || !title.trim()} onClick={() => onSave(title.trim(), levels)}>{t("goalSave")}</PrimaryButton>
        <GhostButton small onClick={onCancel}>{t("goalCancel")}</GhostButton>
      </div>
    </div>
  );
}

export function GoalsView({ patient, user, onBack, onPatientUpdated }: {
  patient: Patient;
  user: SessionUser;
  onBack: () => void;
  onPatientUpdated: (p: Patient) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Belt to the server's suspenders: the goals route enforces the same rule.
  const canEdit =
    patient.status !== "archived" &&
    (user.role === "director" || (user.role === "therapist" && patient.therapistId === user.id));

  const run = async (fn: () => Promise<{ patient: Patient }>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      onPatientUpdated(r.patient);
      return true;
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const anyRatings = patient.goals.some((g) => g.ratings.length > 0);

  return (
    <div className="max-w-4xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3"
        style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {t("backToOverview")}
      </button>

      <SectionTitle sub={t("goalsMethodNote")}>{t("goalsViewTitle")} — {patient.name}</SectionTitle>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("goalChartTitle")}</h3>
        {anyRatings ? (
          <GoalChart goals={patient.goals} />
        ) : (
          <p className="text-sm" style={{ color: C.muted }}>{t("goalChartEmpty")}</p>
        )}
      </Card>

      {msg && <p className="text-xs mb-3" style={{ color: C.danger }}>{msg}</p>}

      {patient.goals.length === 0 && !adding && (
        <Card className="p-5 mb-4"><p className="text-sm" style={{ color: C.muted }}>{t("goalsNone")}</p></Card>
      )}

      <div className="grid md:grid-cols-2 gap-4 items-start">
        {patient.goals.map((g) =>
          editingId === g.id ? (
            <Card key={g.id} className="p-4">
              <GoalEditor initial={g} busy={busy}
                onSave={async (title, levels) => {
                  if (await run(() => api.updateGoal(patient.id, g.id, { title, levels }))) setEditingId(null);
                }}
                onCancel={() => setEditingId(null)} />
            </Card>
          ) : (
            <GoalLadder key={g.id} goal={g} readOnly={!canEdit} busy={busy}
              onRate={(level, at) => run(() => api.rateGoal(patient.id, g.id, { level, at }))}
              onRemoveRating={(at) => run(() => api.removeGoalRating(patient.id, g.id, at))}
              onEdit={() => { setAdding(false); setEditingId(g.id); }}
              onDelete={() => run(() => api.deleteGoal(patient.id, g.id))} />
          ),
        )}

        {canEdit && patient.goals.length < 10 && (
          <Card className="p-4">
            {adding ? (
              <>
                <h3 className="text-sm font-bold mb-3" style={{ color: C.spruce }}>{t("goalAddTitle")}</h3>
                <GoalEditor busy={busy}
                  onSave={async (title, levels) => {
                    if (await run(() => api.createGoal(patient.id, { title, levels }))) setAdding(false);
                  }}
                  onCancel={() => setAdding(false)} />
              </>
            ) : (
              <GhostButton small onClick={() => { setEditingId(null); setAdding(true); }}>+ {t("goalAddTitle")}</GhostButton>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
