"use client";
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { tr, type Lang } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { MODULES } from "@/lib/dips/schema";
import { gridRows, isVisible } from "@/lib/dips/engine";
import { toFHIR } from "@/lib/dips/fhir";
import type { DipsModule, Item } from "@/lib/dips/types";
import type { ModuleAnswers, Patient } from "@/lib/types";
import { T } from "@/lib/i18n";
import { useLang, useT } from "./LangContext";
import { inkIsEmpty, inkKey, parseInk } from "@/lib/ink";
import { InkPreview } from "./InkPad";

/// Stored handwriting for a free-text item, if any (yesno_text notes live
/// under `<id>_text_ink`, textarea notes under `<id>_ink`).
function inkOf(item: Item, m: ModuleAnswers) {
  const key = item.type === "yesno_text" ? inkKey(`${item.id}_text`) : item.type === "textarea" ? inkKey(item.id) : null;
  const ink = key ? parseInk(m[key]) : null;
  return ink && !inkIsEmpty(ink) ? ink : null;
}

function SumRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
      <span className="text-sm" style={{ color: C.muted, minWidth: 150 }}>{label}</span>
      <span className="text-sm text-right" style={{ color: C.ink }}>{children}</span>
    </div>
  );
}

function renderAnswerValue(item: Item, m: ModuleAnswers, lang: Lang, endorsedOf: (n: number, total: number) => string, noneEndorsed: string): string {
  const v = m[item.id];
  switch (item.type) {
    case "yesno": {
      let b = v === "yes" ? tr(T.yes, lang) : v === "no" ? tr(T.no, lang) : "—";
      if (item.checks) {
        const ex = item.checks.filter((c) => m[`${item.id}_${c.key}`]).map((c) => tr(c.label, lang));
        if (ex.length) b += ` (${ex.join(", ")})`;
      }
      return b;
    }
    case "yesno_text": {
      const b = v === "yes" ? tr(T.yes, lang) : v === "no" ? tr(T.no, lang) : "—";
      const t = m[`${item.id}_text`];
      return t ? `${b} — ${t}` : b;
    }
    case "monthyear_range": {
      const f = m[`${item.id}_from`];
      const t = m[`${item.id}_to`];
      return f || t ? `${f || "?"} → ${t || "?"}` : "—";
    }
    case "dual_scale":
      return (item.parts ?? []).map((p) => `${tr(p.label, lang)}: ${m[`${item.id}_${p.key}`] ?? "—"}`).join(" · ");
    case "grid": {
      const rows = gridRows(item).filter((r) => m[`${item.id}_${r.key}_primary`] === "yes");
      return rows.length ? endorsedOf(rows.length, gridRows(item).length) : noneEndorsed;
    }
    default:
      return v != null ? String(v) : "—";
  }
}

function ModuleSummary({ mod, m }: { mod: DipsModule; m: ModuleAnswers }) {
  const t = useT();
  const { lang } = useLang();
  const grid = mod.sections.flatMap((s) => s.items).find((it) => it.type === "grid");
  const endorsed = grid ? gridRows(grid).filter((r) => m[`${grid.id}_${r.key}_primary`] === "yes") : [];
  const impair = m["impact_impair"];
  const distress = m["impact_distress"];
  const clinSev = m["clinsev_sev"];
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded-full" style={{ width: 10, height: 10, background: mod.color }} />
        <h4 className="text-sm font-bold" style={{ color: C.ink }}>{tr(mod.title, lang)}</h4>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>{t("screenedPositiveBadge")}</span>
      </div>
      {grid && <SumRow label={tr(grid.q, lang).replace(/\?$/, "")}>{t("endorsedOf", { n: endorsed.length, total: gridRows(grid).length })}</SumRow>}
      {(impair != null || distress != null) && <SumRow label={t("impairDistress")}>{(impair ?? "—") as React.ReactNode} / {(distress ?? "—") as React.ReactNode}</SumRow>}
      {clinSev != null && <SumRow label={t("clinSevLabel")}>{clinSev as React.ReactNode} / 8</SumRow>}
      {endorsed.length > 0 && (
        <div className="mt-2 mb-1 flex flex-wrap gap-1.5">
          {endorsed.slice(0, 12).map((r) => {
            const sev = m[`${grid!.id}_${r.key}_sev`];
            return (
              <span key={r.key} className="text-xs px-2 py-1 rounded-full" style={{ background: C.surfaceAlt, color: C.ink }}>
                {tr(r.label, lang)}{sev != null && <span style={{ color: C.spruce, fontWeight: 700 }}> · {sev as React.ReactNode}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DipsSummary({ patient }: { patient: Patient }) {
  const t = useT();
  const { lang } = useLang();
  const dips = patient.dips!;
  const answers = useMemo(() => dips.answers || {}, [dips.answers]);
  const entered = MODULES.filter((mod) => mod.enter(answers[mod.id] || {}));
  const langName =
    dips.lang === "de" ? t("langNameDe") : dips.lang === "fr" ? t("langNameFr") : dips.lang === "en" ? t("langNameEn") : dips.lang;
  const sub = dips.submission;
  const [showFhir, setShowFhir] = useState(false);
  const fhir = useMemo(
    () => toFHIR({ id: patient.id, name: patient.name, demographics: patient.demographics }, { answers, lang: dips.lang, completedAt: dips.completedAt }),
    [patient, answers, dips.lang, dips.completedAt],
  );
  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <p className="text-xs" style={{ color: C.muted }}>{t("dipsCompletedMeta", { date: fmtDate(dips.completedAt), lang: langName })}</p>
        {sub && (
          <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: sub.status === "sent" ? C.spruceSoft : C.amberSoft, color: sub.status === "sent" ? C.spruce : C.amber }}>
            {sub.status === "sent"
              ? (sub.httpStatus ? t("dipsRelayed", { status: sub.httpStatus }) : t("dipsStoredDb"))
              : sub.status === "sending" ? t("dipsSendingShort") : t("dipsRelayFailed")}
          </span>
        )}
      </div>
      <div className="rounded-lg px-3 py-2 mb-3" style={{ background: C.amberSoft }}>
        <p className="text-xs" style={{ color: C.amber }}>{t("dipsDisclaimer")}</p>
      </div>
      {entered.length === 0 ? (
        <p className="text-sm" style={{ color: C.muted }}>{t("dipsNonePositive")}</p>
      ) : (
        <>
          <p className="text-sm mb-3" style={{ color: C.ink }}>
            <span style={{ color: C.muted }}>{t("screenedPositiveList")} </span>
            <strong>{entered.map((mod) => tr(mod.title, lang)).join(", ")}</strong>
          </p>
          {entered.map((mod) => <ModuleSummary key={mod.id} mod={mod} m={answers[mod.id] || {}} />)}
        </>
      )}
      {entered.length > 0 && (
      <details className="mt-2">
        <summary className="text-xs font-semibold cursor-pointer" style={{ color: C.spruce }}>
          {t("showModuleResponses", { modules: entered.map((mod) => tr(mod.title, lang)).join(", ") })}
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          {entered.map((mod) => {
            const m = answers[mod.id] || {};
            return (
              <div key={mod.id}>
                <p className="text-xs font-bold mb-1" style={{ color: mod.color }}>{tr(mod.title, lang)}</p>
                {mod.sections.flatMap((s) => s.items).filter((it) => it.code && isVisible(it, m)).map((it) => {
                  const ink = inkOf(it, m);
                  return (
                    <div key={it.id} className="text-xs" style={{ color: C.ink }}>
                      <span className="font-bold" style={{ color: C.spruce }}>{it.code}</span> <span style={{ color: C.muted }}>{tr(it.q, lang)}</span> —{" "}
                      {renderAnswerValue(it, m, lang, (n, total) => t("endorsedOf", { n, total }), t("noneEndorsed"))}
                      {ink && (
                        <div className="mt-1 mb-2">
                          <span className="font-semibold block mb-1" style={{ color: C.muted }}>{tr(T.inkLabel, lang)}</span>
                          <InkPreview ink={ink} maxWidth={420} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </details>
      )}
      <details className="mt-2" open={showFhir} onToggle={(e) => setShowFhir((e.target as HTMLDetailsElement).open)}>
        <summary className="text-xs font-semibold cursor-pointer" style={{ color: C.spruce }}>{tr(T.viewPayload, lang)}</summary>
        {showFhir && <pre className="mt-2 text-xs overflow-auto rounded-lg p-3" style={{ background: "#1d2722", color: "#d6e2dc", maxHeight: 320 }}>{JSON.stringify(fhir, null, 2)}</pre>}
      </details>
    </div>
  );
}
