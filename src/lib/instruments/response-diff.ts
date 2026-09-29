// Item-level view of ONE filled-out questionnaire against the same rater's
// previous one (Batch 16 — the dossier's "Antworten" view). Pure and
// client-safe. Recode and favorability direction come from item-display.ts
// (= the scoring engine's itemNumeric), so bar colors and delta colors can
// never disagree with the computed scores or the item heatmap.
import { itemNumeric } from "./scoring";
import { itemValue01 } from "./item-display";
import type { InstrumentDef, ItemDef, RawAnswers } from "./types";
import type { ResponseRecord } from "../types";

export interface ItemRow {
  item: ItemDef;
  /// Stored raw answer as text ("—" when missing) — what the respondent ticked.
  display: string;
  /// 1 = clinically favorable … 0 = unfavorable; null without a usable range.
  value01: number | null;
  /// Signed change of the RAW answer vs. the previous response; null when
  /// either side is missing or non-numeric.
  delta: number | null;
  /// Clinical direction of that change (reverse items and the owning scale's
  /// direction applied): true = better, false = worse, null = unchanged/unknown.
  deltaFavorable: boolean | null;
  /// The item feeds a scale whose safety alert fires in THIS response
  /// (e.g. the BDI-FS suicide item).
  alert: boolean;
}

const rawNumber = (item: ItemDef, raw: RawAnswers[string]): number | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw;
  if (item.valueMap && typeof raw === "string" && raw in item.valueMap) return item.valueMap[raw];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const displayOf = (raw: RawAnswers[string]): string =>
  raw === null || raw === undefined || raw === "" ? "—" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);

/// The same rater's most recent earlier response to the same instrument.
export function previousResponse(responses: ResponseRecord[], r: ResponseRecord): ResponseRecord | null {
  const at = Date.parse(r.occurredAt);
  let best: ResponseRecord | null = null;
  for (const x of responses) {
    if (x.id === r.id || x.instrumentId !== r.instrumentId || x.respondentRole !== r.respondentRole) continue;
    const xAt = Date.parse(x.occurredAt);
    if (xAt >= at) continue;
    if (!best || xAt > Date.parse(best.occurredAt)) best = x;
  }
  return best;
}

/// Items whose owning scale's safety alert fires in this response.
export function alertItemIds(instrument: InstrumentDef, r: ResponseRecord): Set<string> {
  const ids = new Set<string>();
  for (const s of instrument.scales) {
    if (!s.alert || s.formula.type === "custom") continue;
    const v = r.scores[s.key];
    if (typeof v === "number" && v >= s.alert.gte) for (const id of s.formula.items) ids.add(id);
  }
  return ids;
}

export function itemRows(instrument: InstrumentDef, r: ResponseRecord, prev: ResponseRecord | null): ItemRow[] {
  const alerts = alertItemIds(instrument, r);
  return instrument.items.map((item) => {
    const raw = r.rawAnswers[item.id];
    const cur = rawNumber(item, raw);
    const before = prev ? rawNumber(item, prev.rawAnswers[item.id]) : null;
    const delta = cur !== null && before !== null ? cur - before : null;
    const v01 = itemValue01(instrument, item, raw);
    const prev01 = prev ? itemValue01(instrument, item, prev.rawAnswers[item.id]) : null;
    // Favorability of the change follows the recoded, direction-aware value —
    // for a reverse item a RAW increase can be a clinical improvement.
    const deltaFavorable =
      delta === null || delta === 0 || v01 === null || prev01 === null || v01 === prev01 ? null : v01 > prev01;
    return {
      item,
      display: displayOf(raw),
      value01: v01,
      delta,
      deltaFavorable,
      alert: alerts.has(item.id) && itemNumeric(item, raw) !== null,
    };
  });
}
