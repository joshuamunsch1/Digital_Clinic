"use client";
// Measurement-plan editor ("Messplan", Batch 16) — part of the unified
// "Sitzungen & Fragebögen" panel. The plan is set once per patient; after
// that, "jede Sitzung" items go out automatically when a held session is
// logged and interval items are sent by the background sweep. Paper items are
// only flagged as due (entered by hand or by an intern).
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { api, type PlanActionPayload } from "@/lib/api-client";
import type { InstrumentDef } from "@/lib/instruments/types";
import type { Patient, PlanItemRecord } from "@/lib/types";
import {
  INTERVAL_PRESETS_DAYS,
  PLAN_CHANNELS,
  channelProblem,
  defaultChannel,
  defaultPlanItems,
  intervalStatus,
  plannableInstruments,
  type ChannelProblem,
  type PlanChannel,
} from "@/lib/measurement-plan";
import { recommendedInstrumentIds } from "@/lib/recommendations";
import { GhostButton, PrimaryButton, inputStyle } from "./ui";
import { useT } from "./LangContext";

type T = ReturnType<typeof useT>;

/// "every_session" | "interval:<days>" — one select for rhythm + interval.
const rhythmValue = (i: Pick<PlanItemRecord, "rhythm" | "intervalDays">) =>
  i.rhythm === "interval" && i.intervalDays ? `interval:${i.intervalDays}` : "every_session";
const parseRhythm = (v: string): { rhythm: "every_session" | "interval"; intervalDays: number | null } =>
  v.startsWith("interval:") ? { rhythm: "interval", intervalDays: Number(v.slice(9)) } : { rhythm: "every_session", intervalDays: null };

export const intervalLabel = (days: number, t: T) =>
  days % 7 === 0 ? (days === 7 ? t("planWeekly") : t("planEveryNWeeks", { n: days / 7 })) : t("planEveryNDays", { n: days });

export const rhythmLabel = (i: Pick<PlanItemRecord, "rhythm" | "intervalDays">, t: T) =>
  i.rhythm === "interval" && i.intervalDays ? intervalLabel(i.intervalDays, t) : t("planEverySession");

export const channelLabel = (c: PlanChannel, t: T) =>
  c === "in_app" ? t("channelInApp") : c === "limesurvey" ? "LimeSurvey" : t("planChannelPaper");

const problemText = (p: ChannelProblem, t: T) =>
  p === "no_wording" ? t("inAppNotPossible") : p === "ls_unconfigured" ? t("lsNotConfigured") : p === "ls_unlinked" ? t("surveyIdUnlinked") : t("planNotFillable");
/// Compact reason for the <option> label (the full text is its tooltip).
const problemShort = (p: ChannelProblem, t: T) =>
  p === "no_wording" ? t("planProblemNoWording") : p === "ls_unconfigured" ? t("planProblemLsOff") : p === "ls_unlinked" ? t("planProblemLsUnlinked") : t("planNotFillable");

/// One-line plan summary for the folded panel header.
export function planSummaryText(plan: PlanItemRecord[], instruments: InstrumentDef[], t: T): string {
  const active = plan.filter((i) => i.active);
  if (!active.length) return t("planNone");
  const abbr = (id: string) => instruments.find((i) => i.id === id)?.abbreviation ?? id;
  const groups = new Map<string, string[]>();
  for (const i of active) {
    const key = rhythmLabel(i, t);
    groups.set(key, [...(groups.get(key) ?? []), abbr(i.instrumentId)]);
  }
  return `${t("planTitle")}: ${Array.from(groups.entries())
    .map(([rhythm, names]) => `${names.join(", ")} · ${rhythm}`)
    .join("; ")}`;
}

export function PlanEditor({ patient, instruments, configured, readOnly, onPatientUpdated, onStartManualEntry }: {
  patient: Patient;
  instruments: InstrumentDef[];
  configured: boolean;
  readOnly: boolean;
  onPatientUpdated: (p: Patient) => void;
  onStartManualEntry: (inst: InstrumentDef, ctx: { sessionNumber?: number }) => void;
}) {
  const t = useT();
  const now = new Date();
  const recIds = useMemo(() => recommendedInstrumentIds(patient, instruments), [patient, instruments]);
  const plannable = useMemo(
    () =>
      plannableInstruments(instruments, patient).sort(
        (a, b) => Number(recIds.has(b.id)) - Number(recIds.has(a.id)) || a.abbreviation.localeCompare(b.abbreviation),
      ),
    [instruments, patient, recIds],
  );
  const inPlan = new Set(patient.plan.map((i) => i.instrumentId));
  const addable = plannable.filter((i) => !inPlan.has(i.id));
  const [addId, setAddId] = useState("");
  const addInst = addable.find((i) => i.id === addId) ?? addable[0];
  const [addRhythm, setAddRhythm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const instOf = (id: string) => instruments.find((i) => i.id === id);
  const defaults = useMemo(() => defaultPlanItems(patient, instruments, configured), [patient, instruments, configured]);

  const run = async (payload: PlanActionPayload) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.planAction(patient.id, payload);
      onPatientUpdated(r.patient);
    } catch (e) {
      const m = (e as Error).message;
      setMsg(`✗ ${m === "network_restricted" ? t("networkRestricted") : m === "already_planned" ? t("planAlreadyPlanned") : m}`);
    } finally {
      setBusy(false);
    }
  };

  const statusOf = (item: PlanItemRecord) => {
    const inst = instOf(item.instrumentId);
    if (!item.active) return <span style={{ color: C.muted }}>{t("planPaused")}</span>;
    if (item.rhythm === "every_session")
      return (
        <span style={{ color: C.muted }}>
          {item.channel === "paper" ? t("planPaperAfterSession") : t("planAutoAfterSession")}
        </span>
      );
    const st = intervalStatus(item, patient.invitations, patient.responses, now);
    if (st.waiting) return <span style={{ color: C.blue }}>{t("planWaiting")}</span>;
    if (st.due)
      return item.channel === "paper" ? (
        <span className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: C.amber }}>{t("planDuePaper")}</span>
          {inst && !readOnly && (
            <button type="button" className="font-semibold" onClick={() => onStartManualEntry(inst, {})}
              style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              {t("enterManually")}
            </button>
          )}
        </span>
      ) : (
        <span className="font-semibold" style={{ color: C.amber }}>{t("planDueNextRun")}</span>
      );
    return <span style={{ color: C.muted }}>{t("planNextOn", { date: st.dueAt ? fmtDate(new Date(st.dueAt)) : "—" })}</span>;
  };

  const rhythmSelect = (value: string, onChange: (v: string) => void, disabled?: boolean) => (
    <select style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 12 }} value={value} disabled={disabled || readOnly}
      aria-label={t("planRhythmLabel")} onChange={(e) => onChange(e.target.value)}>
      <option value="every_session">{t("planEverySession")}</option>
      {INTERVAL_PRESETS_DAYS.map((d) => <option key={d} value={`interval:${d}`}>{intervalLabel(d, t)}</option>)}
    </select>
  );

  return (
    <div className="rounded-lg p-3 mt-2" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-bold" style={{ color: C.spruce }}>{t("planTitle")}</p>
        <p className="text-xs" style={{ color: C.muted }}>{t("planSub")}</p>
      </div>

      {patient.plan.length === 0 ? (
        <div className="mt-2">
          <p className="text-xs" style={{ color: C.muted }}>
            {t("planEmpty")}
            {defaults.length > 0 &&
              ` ${t("planDefaultsAre", { list: defaults.map((d) => `${instOf(d.instrumentId)?.abbreviation ?? d.instrumentId} (${channelLabel(d.channel, t)})`).join(", ") })}`}
          </p>
          {!readOnly && defaults.length > 0 && (
            <div className="mt-2">
              <PrimaryButton small disabled={busy} onClick={() => void run({ action: "applyDefaults" })}>{t("planApplyDefaults")}</PrimaryButton>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1 mt-2">
          {patient.plan.map((item) => {
            const inst = instOf(item.instrumentId);
            return (
              <div key={item.id} className="flex items-center gap-2 flex-wrap rounded-md px-2 py-1 text-xs"
                style={{ background: C.surface, border: `1px solid ${C.line}`, opacity: item.active ? 1 : 0.6 }}>
                <label className="flex items-center gap-1.5" title={t("planActiveToggle")}>
                  <input type="checkbox" checked={item.active} disabled={busy || readOnly}
                    onChange={(e) => void run({ action: "update", itemId: item.id, active: e.target.checked })} />
                  <span className="font-semibold" style={{ color: C.ink }}>
                    {inst?.abbreviation ?? item.instrumentId}{recIds.has(item.instrumentId) ? " ★" : ""}
                  </span>
                </label>
                {rhythmSelect(rhythmValue(item), (v) => void run({ action: "update", itemId: item.id, ...parseRhythm(v) }), busy)}
                <select style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 12 }} value={item.channel}
                  disabled={busy || readOnly} aria-label={t("channelLabel")}
                  onChange={(e) => void run({ action: "update", itemId: item.id, channel: e.target.value as PlanChannel })}>
                  {PLAN_CHANNELS.map((c) => {
                    const problem = inst ? channelProblem(inst, c, configured) : "not_fillable";
                    return (
                      <option key={c} value={c} disabled={!!problem} title={problem ? problemText(problem, t) : undefined}>
                        {channelLabel(c, t)}{problem ? ` (${problemShort(problem, t)})` : ""}
                      </option>
                    );
                  })}
                </select>
                <span className="min-w-0">{statusOf(item)}</span>
                {!readOnly && (
                  <button type="button" className="ml-auto font-semibold" disabled={busy}
                    onClick={() => void run({ action: "remove", itemId: item.id })}
                    style={{ color: C.danger, background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>
                    {t("planRemove")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && patient.plan.length > 0 && addInst && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <select style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 12, maxWidth: 260 }} value={addInst.id}
            aria-label={t("planAddLabel")} onChange={(e) => { setAddId(e.target.value); setAddRhythm(null); }}>
            {addable.map((i) => (
              <option key={i.id} value={i.id}>{recIds.has(i.id) ? "★ " : ""}{i.abbreviation} — {i.name.length > 36 ? `${i.name.slice(0, 36)}…` : i.name}</option>
            ))}
          </select>
          {rhythmSelect(
            addRhythm ?? (addInst.cadenceType === "every_session" ? "every_session" : "interval:14"),
            setAddRhythm,
            busy,
          )}
          <GhostButton small disabled={busy} onClick={() => {
            const r = parseRhythm(addRhythm ?? (addInst.cadenceType === "every_session" ? "every_session" : "interval:14"));
            void run({ action: "add", instrumentId: addInst.id, ...r, channel: defaultChannel(addInst, configured) }).then(() => setAddRhythm(null));
          }}>
            + {t("planAdd")}
          </GhostButton>
          <span className="text-xs" style={{ color: C.muted }}>{t("planAddHint")}</span>
        </div>
      )}
      {msg && <p className="text-xs mt-2" style={{ color: C.danger }}>{msg}</p>}
    </div>
  );
}
