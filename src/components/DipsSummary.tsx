"use client";
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { tr } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { MODULES } from "@/lib/dips/schema";
import { gridRows, isVisible } from "@/lib/dips/engine";
import { toFHIR } from "@/lib/dips/fhir";
import type { DipsModule, Item } from "@/lib/dips/types";
import type { ModuleAnswers, Patient } from "@/lib/types";
import { T } from "@/lib/i18n";

function SumRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
      <span className="text-sm" style={{ color: C.muted, minWidth: 150 }}>{label}</span>
      <span className="text-sm text-right" style={{ color: C.ink }}>{children}</span>
    </div>
  );
}

function renderAnswerValue(item: Item, m: ModuleAnswers): string {
  const v = m[item.id];
  switch (item.type) {
    case "yesno": {
      let b = v === "yes" ? "Yes" : v === "no" ? "No" : "—";
      if (item.checks) {
        const ex = item.checks.filter((c) => m[`${item.id}_${c.key}`]).map((c) => tr(c.label, "en"));
        if (ex.length) b += ` (${ex.join(", ")})`;
      }
      return b;
    }
    case "yesno_text": {
      const b = v === "yes" ? "Yes" : v === "no" ? "No" : "—";
      const t = m[`${item.id}_text`];
      return t ? `${b} — ${t}` : b;
    }
    case "monthyear_range": {
      const f = m[`${item.id}_from`];
      const t = m[`${item.id}_to`];
      return f || t ? `${f || "?"} → ${t || "?"}` : "—";
    }
    case "dual_scale":
      return (item.parts ?? []).map((p) => `${tr(p.label, "en")}: ${m[`${item.id}_${p.key}`] ?? "—"}`).join(" · ");
    case "grid": {
      const rows = gridRows(item).filter((r) => m[`${item.id}_${r.key}_primary`] === "yes");
      return rows.length ? `${rows.length} of ${gridRows(item).length} endorsed` : "none endorsed";
    }
    default:
      return v != null ? String(v) : "—";
  }
}

function ModuleSummary({ mod, m }: { mod: DipsModule; m: ModuleAnswers }) {
  const grid = mod.sections.flatMap((s) => s.items).find((it) => it.type === "grid");
  const endorsed = grid ? gridRows(grid).filter((r) => m[`${grid.id}_${r.key}_primary`] === "yes") : [];
  const impair = m["impact_impair"];
  const distress = m["impact_distress"];
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded-full" style={{ width: 10, height: 10, background: mod.color }} />
        <h4 className="text-sm font-bold" style={{ color: C.ink }}>{tr(mod.title, "en")}</h4>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>screened positive</span>
      </div>
      {grid && <SumRow label={tr(grid.q, "en").replace(/\?$/, "")}>{endorsed.length} of {gridRows(grid).length} endorsed</SumRow>}
      {(impair != null || distress != null) && <SumRow label="Impairment / distress (0–8)">{(impair ?? "—") as React.ReactNode} / {(distress ?? "—") as React.ReactNode}</SumRow>}
      {endorsed.length > 0 && (
        <div className="mt-2 mb-1 flex flex-wrap gap-1.5">
          {endorsed.slice(0, 12).map((r) => {
            const sev = m[`${grid!.id}_${r.key}_sev`];
            return (
              <span key={r.key} className="text-xs px-2 py-1 rounded-full" style={{ background: C.surfaceAlt, color: C.ink }}>
                {tr(r.label, "en")}{sev != null && <span style={{ color: C.spruce, fontWeight: 700 }}> · {sev as React.ReactNode}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DipsSummary({ patient }: { patient: Patient }) {
  const dips = patient.dips!;
  const answers = dips.answers || {};
  const entered = MODULES.filter((mod) => mod.enter(answers[mod.id] || {}));
  const langName = ({ de: "German", fr: "French", en: "English" } as Record<string, string>)[dips.lang] || dips.lang;
  const sub = dips.submission;
  const [showFhir, setShowFhir] = useState(false);
  const fhir = useMemo(
    () => toFHIR({ id: patient.id, name: patient.name, demographics: patient.demographics }, { answers, lang: dips.lang, completedAt: dips.completedAt }),
    [patient, answers, dips.lang, dips.completedAt],
  );
  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <p className="text-xs" style={{ color: C.muted }}>Completed {fmtDate(dips.completedAt)} · language: {langName}</p>
        {sub && (
          <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: sub.status === "sent" ? C.spruceSoft : C.amberSoft, color: sub.status === "sent" ? C.spruce : C.amber }}>
            {sub.status === "sent" ? (sub.httpStatus ? `Relayed · HTTP ${sub.httpStatus}` : "Stored in clinic DB") : sub.status === "sending" ? "Sending…" : "Stored; relay failed"}
          </span>
        )}
      </div>
      <div className="rounded-lg px-3 py-2 mb-3" style={{ background: C.amberSoft }}>
        <p className="text-xs" style={{ color: C.amber }}>Self-report screening summary — a clinical aid, not a diagnosis. The diagnosis is recorded by the clinician after the intake interview.</p>
      </div>
      {entered.length === 0 ? (
        <p className="text-sm" style={{ color: C.muted }}>No anxiety module screened positive. The patient answered the screening questions; none met the threshold to continue.</p>
      ) : (
        <>
          <p className="text-sm mb-3" style={{ color: C.ink }}>
            <span style={{ color: C.muted }}>Screened positive: </span>
            <strong>{entered.map((mod) => tr(mod.title, "en")).join(", ")}</strong>
          </p>
          {entered.map((mod) => <ModuleSummary key={mod.id} mod={mod} m={answers[mod.id] || {}} />)}
        </>
      )}
      <details className="mt-2">
        <summary className="text-xs font-semibold cursor-pointer" style={{ color: C.spruce }}>Show all responses</summary>
        <div className="mt-2 flex flex-col gap-3">
          {entered.map((mod) => {
            const m = answers[mod.id] || {};
            return (
              <div key={mod.id}>
                <p className="text-xs font-bold mb-1" style={{ color: mod.color }}>{tr(mod.title, "en")}</p>
                {mod.sections.flatMap((s) => s.items).filter((it) => it.code && isVisible(it, m)).map((it) => (
                  <div key={it.id} className="text-xs" style={{ color: C.ink }}>
                    <span className="font-bold" style={{ color: C.spruce }}>{it.code}</span> <span style={{ color: C.muted }}>{tr(it.q, "en")}</span> — {renderAnswerValue(it, m)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </details>
      <details className="mt-2" open={showFhir} onToggle={(e) => setShowFhir((e.target as HTMLDetailsElement).open)}>
        <summary className="text-xs font-semibold cursor-pointer" style={{ color: C.spruce }}>{tr(T.viewPayload, "en")}</summary>
        {showFhir && <pre className="mt-2 text-xs overflow-auto rounded-lg p-3" style={{ background: "#1d2722", color: "#d6e2dc", maxHeight: 320 }}>{JSON.stringify(fhir, null, 2)}</pre>}
      </details>
    </div>
  );
}
