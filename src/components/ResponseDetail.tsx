"use client";
// Item-level view of ONE filled-out questionnaire (Batch 16): every item's raw
// answer with a burden bar (same light→dark ramp as the item heatmap) and the
// signed change against the same rater's previous response, safety-alert
// items highlighted, then the computed scale scores. AnswersView wraps it with
// a stepper over the patient's responses — the dossier's "Antworten" tab, the
// target of chart-point / heatmap-column clicks.
import React from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { trRaterRole, trSource } from "@/lib/i18n";
import type { InstrumentDef } from "@/lib/instruments/types";
import { itemRows, previousResponse } from "@/lib/instruments/response-diff";
import type { ResponseRecord, Therapist } from "@/lib/types";
import { fmtScore } from "@/lib/types";
import { occasionOf } from "./charts";
import { heatColor } from "./heatmap";
import { useLang, useT } from "./LangContext";

const occasionText = (instrument: InstrumentDef, r: ResponseRecord) => {
  const occ = occasionOf(instrument, r);
  const date = fmtDate(r.occurredAt);
  return occ.label === date ? date : `${occ.label} · ${date}`;
};

export function ResponseDetail({ instrument, response, previous, therapists }: {
  instrument: InstrumentDef;
  response: ResponseRecord;
  previous: ResponseRecord | null;
  therapists: Therapist[];
}) {
  const t = useT();
  const { lang } = useLang();
  const conductedBy = therapists.find((th) => th.id === response.conductedById);
  const rows = itemRows(instrument, response, previous);
  const scored = instrument.scales.filter((s) => response.scores[s.key] !== undefined);
  return (
    <div>
      <p className="text-xs mb-2" style={{ color: C.muted }}>
        <span className="font-bold" style={{ color: C.ink }}>{occasionText(instrument, response)}</span>
        {" · "}{trRaterRole(response.respondentRole, lang)} · {t("via")} {trSource(response.source, lang)}
        {conductedBy ? ` · ${t("conductedBy")}: ${conductedBy.name}` : ""}
        {response.enteredBy ? ` · ${t("enteredByLine", { name: response.enteredBy.name })}` : ""}
        {previous ? ` · ${t("comparedWith", { occ: occasionText(instrument, previous) })}` : ` · ${t("noPreviousResponse")}`}
      </p>
      {rows.length > 0 ? (
        // grid-cols-1 (minmax(0,1fr)) is required below md: an implicit auto
        // column would grow to the nowrap item text and scroll the page sideways.
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
          {rows.map((row) => {
            const severity = row.value01 === null ? null : 1 - row.value01;
            const deltaColor = row.deltaFavorable === null ? C.muted : row.deltaFavorable ? C.spruce : C.danger;
            return (
              <div key={row.item.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs min-w-0"
                style={{ background: row.alert ? "#F7E9E6" : "transparent", borderBottom: `1px solid ${C.line}` }}
                title={row.item.text ?? row.item.label}>
                <span className="flex-1 min-w-0 truncate" style={{ color: row.alert ? C.danger : C.ink, fontWeight: row.alert ? 700 : 400 }}>
                  {row.alert ? "⚠ " : ""}{row.item.text ?? row.item.label}
                  {row.item.reverseScored ? <span style={{ color: C.muted }}> {t("reverseScored")}</span> : null}
                </span>
                <span className="rounded-full shrink-0" style={{ width: 48, height: 6, background: C.surfaceAlt, border: `1px solid ${C.line}` }}>
                  {severity !== null && (
                    <span className="block rounded-full" style={{ height: "100%", width: `${Math.round(severity * 100)}%`, background: heatColor(severity) }} />
                  )}
                </span>
                <span className="font-bold shrink-0 text-right" style={{ color: C.ink, width: 26, fontVariantNumeric: "tabular-nums" }}>{row.display}</span>
                <span className="shrink-0 text-right" style={{ color: deltaColor, width: 38, fontVariantNumeric: "tabular-nums" }}>
                  {row.delta === null ? "" : row.delta === 0 ? "±0" : `${row.delta > 0 ? "▲ +" : "▼ "}${fmtScore(row.delta)}`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs" style={{ color: C.muted }}>{t("noItemAnswers")}</p>
      )}
      {scored.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-xs font-bold" style={{ color: C.spruce }}>{t("computedScores")}:</span>
          {scored.map((s) => {
            const v = response.scores[s.key];
            const band = s.normBands?.find((b) => v >= b.min && v <= b.max);
            return (
              <span key={s.key} className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.surfaceAlt, color: C.ink, border: `1px solid ${C.line}` }}>
                {s.label}: <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtScore(v)}</b>{band ? ` (${band.label})` : ""}
              </span>
            );
          })}
        </div>
      )}
      {response.note && <p className="text-xs mt-2" style={{ color: C.ink }}>{t("noteQuote")}: “{response.note}”</p>}
      {rows.length > 0 && <p className="text-xs mt-2" style={{ color: C.muted }}>{t("answersLegend")}</p>}
    </div>
  );
}

/// Stepper over a patient's responses to one instrument (chronological),
/// showing the selected one — default: the most recent — against its
/// predecessor from the same rater.
export function AnswersView({ instrument, responses, therapists, selectedId, onSelect }: {
  instrument: InstrumentDef;
  responses: ResponseRecord[];
  therapists: Therapist[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const ordered = [...responses].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  if (!ordered.length) return <p className="text-sm" style={{ color: C.muted }}>{t("noScoredResponses")}</p>;
  const idx = Math.max(0, ordered.findIndex((r) => r.id === selectedId));
  const current = selectedId && ordered.some((r) => r.id === selectedId) ? ordered[idx] : ordered[ordered.length - 1];
  const curIdx = ordered.indexOf(current);
  const multiRole = new Set(ordered.map((r) => r.respondentRole)).size > 1;
  const stepBtn = (disabled: boolean): React.CSSProperties => ({
    background: "transparent",
    color: disabled ? C.muted : C.spruce,
    border: `1px solid ${C.line}`,
    cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <button type="button" className="rounded-lg font-semibold px-2.5 py-1 text-sm" aria-label={t("olderResponse")} title={t("olderResponse")}
          disabled={curIdx <= 0} onClick={() => onSelect(ordered[curIdx - 1].id)} style={stepBtn(curIdx <= 0)}>‹</button>
        <select className="text-xs rounded-lg px-2 py-1" aria-label={t("responseSelectLabel")} value={current.id}
          onChange={(e) => onSelect(e.target.value)}
          style={{ border: `1px solid ${C.line}`, background: C.surface, color: C.ink, maxWidth: "100%" }}>
          {[...ordered].reverse().map((r) => (
            <option key={r.id} value={r.id}>
              {occasionText(instrument, r)}{multiRole ? ` · ${trRaterRole(r.respondentRole, lang)}` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="rounded-lg font-semibold px-2.5 py-1 text-sm" aria-label={t("newerResponse")} title={t("newerResponse")}
          disabled={curIdx >= ordered.length - 1} onClick={() => onSelect(ordered[curIdx + 1].id)} style={stepBtn(curIdx >= ordered.length - 1)}>›</button>
        {curIdx === ordered.length - 1 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.spruceSoft, color: C.spruce }}>{t("latestResponse")}</span>
        )}
      </div>
      <ResponseDetail instrument={instrument} response={current} previous={previousResponse(ordered, current)} therapists={therapists} />
    </div>
  );
}
