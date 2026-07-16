"use client";
// GAS ladder card — the digital form of the clinic's paper "Zielerreichungs-
// skala" template: one card per goal, five rungs (+3 on top … −1 at the
// bottom) with the therapist-entered level descriptions, the baseline (0 =
// Ausgangslage/Ist-Zustand) visually distinct and the current attainment
// rating highlighted. In staff mode the footer carries the rating input
// (LevelPicker) and the rating history; readOnly mode (patient portal,
// archived dossiers) renders the ladder alone.
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import type { GoalLevelKey, GoalRecord } from "@/lib/types";
import { GAS_LEVELS, currentGoalRating } from "@/lib/types";
import { Card, GhostButton, PrimaryButton, inputStyle } from "./ui";
import { useT } from "./LangContext";

// No soft danger token in the theme — local tint for the −1 chip, matching
// the amberSoft/blueSoft register.
const DANGER_SOFT = "#F2E4E0";

export const fmtLevel = (lvl: number) => (lvl > 0 ? `+${lvl}` : `${lvl}`);

function levelColors(lvl: number): { bg: string; fg: string } {
  if (lvl > 0) return { bg: C.spruceSoft, fg: C.spruce };
  if (lvl === 0) return { bg: C.blueSoft, fg: C.blue };
  return { bg: DANGER_SOFT, fg: C.danger };
}

export function GoalLevelChip({ level }: { level: number }) {
  const c = levelColors(level);
  return (
    <span className="text-xs font-bold rounded-md text-center shrink-0" style={{ background: c.bg, color: c.fg, width: 30, padding: "3px 0", fontVariantNumeric: "tabular-nums" }}>
      {fmtLevel(level)}
    </span>
  );
}

/// Attainment-level input: one button per GAS level (−1…+3), same visual idiom
/// as the questionnaire Likert rows (selected = spruce fill).
export function LevelPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const t = useT();
  return (
    <div>
      <div className="flex gap-1">
        {[-1, 0, 1, 2, 3].map((v) => {
          const on = value === v;
          return (
            <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={on} className="rounded-md text-xs font-semibold"
              style={{ width: 36, height: 32, background: on ? C.spruce : C.surfaceAlt, color: on ? "#fff" : C.muted, border: `1px solid ${on ? C.spruce : C.line}` }}>
              {fmtLevel(v)}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs mt-1" style={{ color: C.muted, maxWidth: 186 }}>
        <span>{t("goalLevelNegative")}</span>
        <span>{t("goalLevelPositive")}</span>
      </div>
    </div>
  );
}

export function GoalLadder({ goal, readOnly, busy, onRate, onRemoveRating, onEdit, onDelete }: {
  goal: GoalRecord;
  readOnly?: boolean;
  busy?: boolean;
  onRate?: (level: number, at: string) => void;
  onRemoveRating?: (at: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  const current = currentGoalRating(goal);
  const [level, setLevel] = useState<number | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-bold" style={{ color: C.ink }}>{goal.title}</p>
        {current ? <GoalLevelChip level={current.level} /> : (
          <span className="text-xs whitespace-nowrap" style={{ color: C.muted }}>{t("goalNoRatings")}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {GAS_LEVELS.map((lvl) => {
          const desc = goal.levels[String(lvl) as GoalLevelKey];
          const isBaseline = lvl === 0;
          const isCurrent = current?.level === lvl;
          // Row captions mirror the paper template: +3 = positive erwünschte
          // Veränderung, 0 = Ausgangslage/Ist-Zustand, −1 = negative Veränderung.
          const caption = lvl === 3 ? t("goalLevelPositive") : isBaseline ? t("goalLevelBaseline") : lvl === -1 ? t("goalLevelNegative") : null;
          return (
            <div key={lvl} className="rounded-lg px-3 py-2 flex gap-3 items-start"
              style={{
                background: isCurrent ? C.spruceSoft : isBaseline ? C.blueSoft : C.surfaceAlt,
                border: isCurrent ? `1.5px solid ${C.spruce}` : `1px solid ${C.line}`,
              }}>
              <GoalLevelChip level={lvl} />
              <div className="flex-1 min-w-0">
                {caption && (
                  <p className="text-xs font-semibold" style={{ color: levelColors(lvl).fg }}>{caption}</p>
                )}
                <p className="text-sm" style={{ color: desc ? C.ink : C.muted }}>{desc || "—"}</p>
              </div>
              {isCurrent && current && (
                <span className="text-xs font-semibold whitespace-nowrap rounded-full px-2 py-0.5" style={{ background: C.spruce, color: "#fff" }}>
                  {t("goalCurrent")} · {fmtDate(current.at)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {readOnly && current && (
        <p className="text-xs mt-3" style={{ color: C.muted }}>
          {t("goalCurrentRating", { level: fmtLevel(current.level), date: fmtDate(current.at) })}
        </p>
      )}

      {!readOnly && (
        <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
          <p className="text-xs font-bold mb-2" style={{ color: C.muted }}>{t("goalRateTitle")}</p>
          <div className="flex items-start gap-3 flex-wrap">
            <LevelPicker value={level} onChange={setLevel} />
            <input type="date" aria-label={t("goalRateDate")} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13 }}
              value={date} onChange={(e) => setDate(e.target.value)} />
            <PrimaryButton small disabled={busy || level === null || !date}
              onClick={() => { if (level !== null && onRate) { onRate(level, date); setLevel(null); } }}>
              {t("goalRateSave")}
            </PrimaryButton>
          </div>

          {goal.ratings.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold mb-1" style={{ color: C.muted }}>{t("goalRatingHistory")}</p>
              <div className="flex flex-col gap-1">
                {[...goal.ratings].reverse().map((r) => (
                  <div key={r.at} className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-xs" style={{ background: C.surfaceAlt }}>
                    <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{fmtDate(r.at)}</span>
                    <GoalLevelChip level={r.level} />
                    <span style={{ color: C.muted }}>{r.by}</span>
                    <button type="button" className="ml-auto font-semibold" disabled={busy} onClick={() => onRemoveRating?.(r.at)}
                      style={{ color: C.danger, background: "none", border: "none", cursor: "pointer", fontSize: 11 }}>
                      {t("goalDelete")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <GhostButton small onClick={onEdit}>{t("goalEdit")}</GhostButton>
            {confirmDelete ? (
              <>
                <button type="button" className="rounded-lg font-semibold px-3 py-1.5 text-xs" disabled={busy} onClick={onDelete}
                  style={{ background: C.danger, color: "#fff", border: `1px solid ${C.danger}`, cursor: "pointer" }}>
                  {t("goalDeleteConfirm")}
                </button>
                <GhostButton small onClick={() => setConfirmDelete(false)}>{t("goalCancel")}</GhostButton>
              </>
            ) : (
              <button type="button" className="rounded-lg font-semibold px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(true)}
                style={{ background: "transparent", color: C.danger, border: `1px solid ${C.line}`, cursor: "pointer" }}>
                {t("goalDelete")}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
