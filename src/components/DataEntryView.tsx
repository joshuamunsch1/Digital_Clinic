"use client";
// Intern home (Praktikant:in, Batch 16): enter paper questionnaires matched by
// patient CODE only. The view never receives a name, e-mail, age, score or
// diagnosis — the lookup returns the code, the assigned therapist (to catch a
// mistyped code: "this form came from Dr. Keller's box") and the dates of
// recent entries (to avoid typing a form twice).
import React, { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { api, type EntryReceipt, type EntryTarget, type SubmitResponsePayload } from "@/lib/api-client";
import type { InstrumentDef } from "@/lib/instruments/types";
import { trRaterRole } from "@/lib/i18n";
import { Card, GhostButton, PrimaryButton, SectionTitle, StatusBadge, inputStyle } from "./ui";
import { InstrumentForm } from "./InstrumentForm";
import { useLang, useT } from "./LangContext";

const occText = (e: { occurredAt: string; sessionNumber: number | null; wave: string | null }) =>
  [e.sessionNumber != null ? `S${e.sessionNumber}` : null, e.wave, fmtDate(e.occurredAt)].filter(Boolean).join(" · ");

export function DataEntryView({ instruments }: { instruments: InstrumentDef[] }) {
  const t = useT();
  const { lang } = useLang();
  const [codeInput, setCodeInput] = useState("");
  const [target, setTarget] = useState<EntryTarget | null>(null);
  const [instId, setInstId] = useState("");
  const [form, setForm] = useState<InstrumentDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<EntryReceipt | null>(null);
  const [entries, setEntries] = useState<EntryReceipt[]>([]);
  const abbr = (id: string) => instruments.find((i) => i.id === id)?.abbreviation ?? id;

  const errText = (m: string) =>
    m === "unknown_code"
      ? t("entryUnknownCode")
      : m === "invalid_code"
        ? t("entryInvalidCode")
        : m === "archived"
          ? t("entryArchived")
          : m === "network_restricted"
            ? t("networkRestricted")
            : m === "account_inactive"
              ? t("accountInactive")
              : m;

  const loadEntries = useCallback(() => {
    api.myEntries().then((r) => setEntries(r.entries)).catch(() => setEntries([]));
  }, []);
  useEffect(() => loadEntries(), [loadEntries]);

  const lookup = async (code: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.entryLookup(code);
      setTarget(r.target);
      setInstId((prev) => (r.target.instrumentIds.includes(prev) ? prev : (r.target.instrumentIds[0] ?? "")));
    } catch (e) {
      setTarget(null);
      setErr(`✗ ${errText((e as Error).message)}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (payload: SubmitResponsePayload, confirmDuplicate = false) => {
    if (!target || !form) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createEntry({
        code: target.code,
        instrumentId: payload.instrumentId,
        rawAnswers: payload.rawAnswers,
        occurredAt: payload.occurredAt ?? new Date().toISOString(),
        sessionNumber: payload.sessionNumber ?? null,
        wave: payload.wave ?? null,
        respondentRole: payload.respondentRole,
        note: payload.note,
        confirmDuplicate,
      });
      if ("duplicate" in r) {
        if (window.confirm(t("entryDuplicateConfirm", { occ: occText({ ...r.duplicate, wave: null }) }))) {
          await submit(payload, true);
        }
        return;
      }
      setReceipt(r.entry);
      setForm(null);
      loadEntries();
      await lookup(target.code);
    } catch (e) {
      setErr(`✗ ${errText((e as Error).message)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t("entryDeleteConfirm"))) return;
    try {
      await api.deleteEntry(id);
      loadEntries();
      if (target) await lookup(target.code);
    } catch (e) {
      setErr(`✗ ${errText((e as Error).message)}`);
    }
  };

  const codeBanner = target && (
    <Card className="p-3 mb-3" style={{ background: C.blueSoft, border: `1px solid ${C.blue}` }}>
      <p className="text-sm font-bold" style={{ color: C.blue }}>
        {t("entryForCode", { code: target.code })}
        {target.therapistName ? ` · ${t("therapistLabel")} ${target.therapistName}` : ""}
      </p>
    </Card>
  );

  if (form && target) {
    const suggestion = target.suggestions[form.id];
    return (
      <div>
        <InstrumentForm
          key={`${target.code}:${form.id}`}
          instrument={form}
          clinicianMode
          therapists={[]}
          defaultSessionNumber={suggestion?.sessionNumber}
          defaultDate={suggestion?.date ?? undefined}
          banner={codeBanner}
          busy={busy}
          onCancel={() => setForm(null)}
          onSubmit={(payload) => void submit(payload)}
        />
        {err && <p className="text-sm text-center mt-2" style={{ color: C.danger }}>{err}</p>}
      </div>
    );
  }

  const enterable = target ? instruments.filter((i) => target.instrumentIds.includes(i.id)) : [];

  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle sub={t("entrySub")}>{t("entryTitle")}</SectionTitle>
      <Card className="p-4 mb-4" style={{ background: C.surfaceAlt }}>
        <p className="text-xs" style={{ color: C.muted }}>{t("entryPrivacyNote")}</p>
      </Card>

      {receipt && (
        <Card className="p-4 mb-4" style={{ background: C.spruceSoft, border: `1px solid ${C.spruce}` }}>
          <p className="text-sm font-bold" style={{ color: C.spruce }}>
            ✓ {t("entrySaved", { instrument: abbr(receipt.instrumentId), code: receipt.code, occ: occText(receipt) })}
          </p>
        </Card>
      )}

      <Card className="p-5 mb-4">
        <form className="flex items-end gap-2 flex-wrap"
          onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) void lookup(codeInput.trim()); }}>
          <label className="block">
            <span className="text-sm font-semibold block mb-1" style={{ color: C.ink }}>{t("entryCodeLabel")}</span>
            <input style={{ ...inputStyle, width: 170, fontSize: 18, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}
              placeholder="A00123" value={codeInput} autoFocus autoComplete="off" spellCheck={false}
              onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setReceipt(null); }} />
          </label>
          <PrimaryButton submit disabled={busy || !codeInput.trim()}>{busy ? t("working") : t("entryLookup")}</PrimaryButton>
          {target && (
            <GhostButton onClick={() => { setTarget(null); setCodeInput(""); setReceipt(null); setErr(null); }}>{t("entryNewCode")}</GhostButton>
          )}
        </form>
        {err && <p className="text-sm mt-2" style={{ color: C.danger }}>{err}</p>}

        {target && (
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="lc-display text-2xl" style={{ color: C.ink, letterSpacing: 2 }}>{target.code}</span>
              <StatusBadge status={target.status as "assessment" | "interview" | "therapy" | "archived"} />
              <span className="text-sm" style={{ color: C.muted }}>
                {t("therapistLabel")} {target.therapistName ?? t("unassigned")}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: C.muted }}>{t("entryCheckTherapist")}</p>

            <p className="text-xs font-bold mt-3 mb-1" style={{ color: C.muted }}>{t("entryRecent")}</p>
            {target.recent.length ? (
              <div className="flex flex-wrap gap-1.5">
                {target.recent.map((r, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, color: C.ink }}>
                    {abbr(r.instrumentId)} · {occText(r)}{r.respondentRole !== "self" ? ` · ${trRaterRole(r.respondentRole, lang)}` : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: C.muted }}>{t("entryNoRecent")}</p>
            )}

            {target.status === "archived" ? (
              <p className="text-sm mt-3" style={{ color: C.amber }}>{t("entryArchived")}</p>
            ) : enterable.length ? (
              <div className="flex items-end gap-2 flex-wrap mt-4">
                <label className="block">
                  <span className="text-sm font-semibold block mb-1" style={{ color: C.ink }}>{t("instrumentLabel")}</span>
                  <select style={{ ...inputStyle, width: "auto", minWidth: 260 }} value={instId} onChange={(e) => setInstId(e.target.value)}>
                    {enterable.map((i) => (
                      <option key={i.id} value={i.id}>{i.abbreviation} — {i.name.length > 44 ? `${i.name.slice(0, 44)}…` : i.name}</option>
                    ))}
                  </select>
                </label>
                <PrimaryButton disabled={!instId} onClick={() => {
                  const inst = enterable.find((i) => i.id === instId);
                  if (inst) { setReceipt(null); setForm(inst); }
                }}>
                  {t("entryStartForm")}
                </PrimaryButton>
              </div>
            ) : (
              <p className="text-sm mt-3" style={{ color: C.muted }}>{t("entryNothingEnterable")}</p>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-bold mb-2" style={{ color: C.spruce }}>{t("entryMine")}</h3>
        {entries.length ? (
          <div className="flex flex-col gap-1">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-1.5 text-xs" style={{ background: C.surfaceAlt }}>
                <span className="font-bold" style={{ color: C.ink, letterSpacing: 1 }}>{e.code}</span>
                <span className="font-semibold" style={{ color: C.ink }}>{abbr(e.instrumentId)}</span>
                <span style={{ color: C.muted }}>{occText(e)}</span>
                <span style={{ color: C.muted }}>{t("entryEnteredAt", { date: fmtDate(e.createdAt) })}</span>
                {e.deletable && (
                  <button type="button" className="ml-auto font-semibold" onClick={() => void remove(e.id)}
                    style={{ color: C.danger, background: "none", border: "none", cursor: "pointer" }}>
                    {t("entryDelete")}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: C.muted }}>{t("entryMineEmpty")}</p>
        )}
        <p className="text-xs mt-2" style={{ color: C.muted }}>{t("entryDeleteHint")}</p>
      </Card>
    </div>
  );
}
