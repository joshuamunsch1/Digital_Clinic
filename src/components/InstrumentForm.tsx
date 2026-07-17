"use client";
// Generic form renderer for likert_battery instruments: renders straight from
// the instrument's itemSchema. Used by patients (in-app fill-out) and by
// clinicians ("manual entry" of paper forms), replacing the bespoke
// WellbeingForm. Structured interviews (DIPS) keep their dedicated renderer.
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { trRaterRole } from "@/lib/i18n";
import type { InstrumentDef, ItemDef, RawAnswers } from "@/lib/instruments/types";
import type { SubmitResponsePayload } from "@/lib/api-client";
import type { Therapist } from "@/lib/types";
import { RATER_ROLES } from "@/lib/types";
import { Card, Field, GhostButton, PrimaryButton, SectionTitle, inputStyle } from "./ui";
import { useLang, useT } from "./LangContext";

function LikertRow({ item, value, onChange }: { item: ItemDef; value: number | null; onChange: (v: number) => void }) {
  const min = item.min ?? 0;
  const max = item.max ?? 10;
  const count = max - min + 1;
  const wide = count > 8;
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: count }, (_, i) => {
          const v = min + i;
          const on = value === v;
          return (
            <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={on} className="rounded-md text-xs font-semibold"
              style={{ width: wide ? 30 : 36, height: 32, background: on ? C.spruce : C.surfaceAlt, color: on ? "#fff" : C.muted, border: `1px solid ${on ? C.spruce : C.line}` }}>
              {v}
            </button>
          );
        })}
      </div>
      {(item.minLabel || item.maxLabel) && (
        <div className="flex justify-between text-xs mt-1" style={{ color: C.muted, maxWidth: 350 }}>
          <span>{item.min ?? 0} · {item.minLabel ?? ""}</span><span>{item.max ?? 10} · {item.maxLabel ?? ""}</span>
        </div>
      )}
    </div>
  );
}

function CategoricalRow({ item, value, onChange }: { item: ItemDef; value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(item.options ?? []).map((o) => {
        const on = value === o;
        return (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={on} className="rounded-lg text-sm font-semibold px-4 py-2"
            style={{ background: on ? C.spruce : C.surfaceAlt, color: on ? "#fff" : C.muted, border: `1px solid ${on ? C.spruce : C.line}` }}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function InstrumentForm({ instrument, clinicianMode, defaultSessionNumber, therapists, defaultConductedById, onSubmit, onCancel, busy }: {
  instrument: InstrumentDef;
  /// therapists get rater/wave/date context controls; patients just answer
  clinicianMode?: boolean;
  defaultSessionNumber?: number;
  /// clinic staff, for the "conducted by" picker on every-session instruments
  /// (mirrors the legacy PSTB Hilfsskript's per-session Therapeut column).
  therapists?: Therapist[];
  defaultConductedById?: string | null;
  onSubmit: (payload: SubmitResponsePayload) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const [answers, setAnswers] = useState<RawAnswers>({});
  const [note, setNote] = useState("");
  const [role, setRole] = useState(instrument.raterRole === "self" ? "self" : instrument.raterRole);
  const [wave, setWave] = useState((instrument.cadenceConfig.waves ?? ["pre", "zm", "post", "postF"])[0]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [conductedById, setConductedById] = useState(defaultConductedById ?? "");
  // Visible in clinician mode for every-session instruments: manual/paper
  // entries must carry the session number so the ledger can match them.
  const [sessionNumber, setSessionNumber] = useState(
    defaultSessionNumber != null ? String(defaultSessionNumber) : "",
  );

  const set = (id: string, v: number | string) => setAnswers((prev) => ({ ...prev, [id]: v }));
  const required = instrument.items.filter((it) => it.responseType !== "text");
  const ready = required.every((it) => answers[it.id] !== undefined && answers[it.id] !== "");
  const assumedRange = instrument.items.some((it) => it.rangeAssumed);
  const isWave = instrument.cadenceType === "wave";
  const isEverySession = instrument.cadenceType === "every_session";
  const showConductedBy = clinicianMode && isEverySession && !!therapists?.length;
  const showSessionNumber = clinicianMode && isEverySession;

  const submit = () =>
    onSubmit({
      instrumentId: instrument.id,
      rawAnswers: answers,
      note: note || undefined,
      respondentRole: clinicianMode ? role : "self",
      wave: clinicianMode && isWave ? wave : undefined,
      sessionNumber: showSessionNumber
        ? sessionNumber.trim() === "" ? undefined : Number(sessionNumber)
        : defaultSessionNumber,
      conductedById: showConductedBy ? conductedById || null : undefined,
      occurredAt: clinicianMode ? new Date(`${date}T12:00:00`).toISOString() : undefined,
    });

  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle sub={instrument.name}>{instrument.abbreviation}</SectionTitle>
      {assumedRange && (
        <Card className="p-3 mb-3" style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
          <p className="text-xs" style={{ color: C.amber }}>{t("rangeAssumedNote")}</p>
        </Card>
      )}
      {clinicianMode && (
        <Card className="p-4 mb-4">
          <div className="flex gap-3 flex-wrap">
            <Field label={t("ratedBy")}>
              <select style={{ ...inputStyle, width: "auto", minWidth: 140 }} value={role} onChange={(e) => setRole(e.target.value)}>
                {RATER_ROLES.map((r) => <option key={r} value={r}>{trRaterRole(r, lang)}</option>)}
              </select>
            </Field>
            {isWave && (
              <Field label={t("waveLabel")}>
                <select style={{ ...inputStyle, width: "auto", minWidth: 120 }} value={wave} onChange={(e) => setWave(e.target.value)}>
                  {(instrument.cadenceConfig.waves ?? ["pre", "zm", "post", "postF"]).map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </Field>
            )}
            <Field label={t("dateAdministered")}>
              <input type="date" style={{ ...inputStyle, width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {showSessionNumber && (
              <Field label={t("sessionNumberLabel")}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  style={{ ...inputStyle, width: 90 }}
                  value={sessionNumber}
                  onChange={(e) => setSessionNumber(e.target.value)}
                />
              </Field>
            )}
            {showConductedBy && (
              <Field label={t("conductedBy")}>
                <select style={{ ...inputStyle, width: "auto", minWidth: 160 }} value={conductedById} onChange={(e) => setConductedById(e.target.value)}>
                  <option value="">{t("conductedByUnset")}</option>
                  {therapists!.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        </Card>
      )}
      <Card className="p-5 mb-4">
        <div className="flex flex-col gap-5">
          {instrument.items.map((it) => (
            <div key={it.id}>
              <p className="text-sm font-semibold mb-2" style={{ color: C.ink }}>{it.text ?? it.label}</p>
              {it.responseType === "categorical" ? (
                <CategoricalRow item={it} value={(answers[it.id] as string) ?? null} onChange={(v) => set(it.id, v)} />
              ) : it.responseType === "text" ? (
                <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={(answers[it.id] as string) ?? ""} onChange={(e) => set(it.id, e.target.value)} />
              ) : (
                <LikertRow item={it} value={typeof answers[it.id] === "number" ? (answers[it.id] as number) : null} onChange={(v) => set(it.id, v)} />
              )}
            </div>
          ))}
          {instrument.cadenceType === "every_session" && !clinicianMode && (
            <Field label={t("sessionNote")}>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
        </div>
      </Card>
      <div className="flex gap-3 items-center">
        <PrimaryButton disabled={!ready || busy} onClick={submit}>{busy ? t("savingBtn") : t("submitBtn")}</PrimaryButton>
        <GhostButton onClick={onCancel}>{t("backBtn")}</GhostButton>
        {!ready && <span className="text-xs" style={{ color: C.muted }}>{t("answerAllItems")}</span>}
      </div>
    </div>
  );
}
