// Display helpers for item-level visualization (Batch 13 item heatmap).
// Pure and client-safe. The recode is the scoring engine's own `itemNumeric`
// (coercion + valueMap + reversal), so heatmap colors can never disagree with
// the computed scores.
import { itemNumeric } from "./scoring";
import type { InstrumentDef, ItemDef, RawAnswers } from "./types";

/// Display direction of one item: the owning scale's higherIsBetter — the
/// first scale (by sortOrder) whose formula lists the item. Handles mixed
/// instruments (SDQ: Prosoz counts up, problem scales count down). Fallbacks:
/// first scale's direction, then true.
export function itemDirection(instrument: InstrumentDef, itemId: string): boolean {
  const scales = [...instrument.scales].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of scales) {
    if (s.formula.type !== "custom" && s.formula.items.includes(itemId)) return s.higherIsBetter ?? true;
  }
  return scales[0]?.higherIsBetter ?? true;
}

/// The scoring engine's recode of a stored raw answer (reverse items flipped
/// via min + max − v). Null for missing/unparseable/unreversible values.
export function recodeForDisplay(item: ItemDef, raw: RawAnswers[string]): number | null {
  return itemNumeric(item, raw);
}

/// Normalized clinical favorability of one answer: 1 = favorable, 0 =
/// unfavorable, null when the item has no usable numeric range or no answer.
export function itemValue01(instrument: InstrumentDef, item: ItemDef, raw: RawAnswers[string]): number | null {
  const v = itemNumeric(item, raw);
  if (v === null) return null;
  const min = item.min ?? 0;
  const max = item.max;
  if (max === undefined || max <= min) return null;
  const frac = Math.min(1, Math.max(0, (v - min) / (max - min)));
  return itemDirection(instrument, item.id) ? frac : 1 - frac;
}
