"use client";
// Archive of concluded treatments: a separate full-screen view (reached via
// the low-prominence link at the bottom of the dashboard) so the active
// overviews stay uncluttered. Structured like the filesystem export
// (src/lib/archive-export.ts): disorder category ▸ year of conclusion ▸
// patients. The director sees every archived patient, a therapist only the
// ones they treated (client-side scoping, same convention as the dashboard).
import React, { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { trCategory } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import type { ClinicData, Patient, SessionUser } from "@/lib/types";
import { DISORDER_CATEGORIES } from "@/lib/types";
import { Card, SectionTitle } from "./ui";
import { useLang, useT } from "./LangContext";

/// Archived patients visible to this user (director: all; therapist: own).
export function archivedPatientsFor(patients: Patient[], user: SessionUser): Patient[] {
  return patients.filter(
    (p) => p.status === "archived" && (user.role === "director" || p.therapistId === user.id),
  );
}

const yearOf = (p: Patient) => new Date(p.archivedAt ?? 0).getFullYear();

function OutcomeChip({ outcome }: { outcome: string | null }) {
  const t = useT();
  if (!outcome) return null;
  const good = outcome === "completed";
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: good ? C.spruceSoft : C.amberSoft, color: good ? C.spruce : C.amber }}>
      {good ? t("outcomeCompleted") : t("outcomeDropout")}
    </span>
  );
}

export function ArchiveView({ data, user, onOpenPatient, onBack }: {
  data: ClinicData;
  user: SessionUser;
  onOpenPatient: (id: string) => void;
  onBack: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  // category ▸ year (desc) ▸ patients (archivedAt desc); null category → "other".
  const tree = useMemo(() => {
    const archived = archivedPatientsFor(data.patients, user);
    const byCategory = new Map<string, Map<number, Patient[]>>();
    for (const p of archived) {
      const cat = p.disorderCategory ?? "other";
      const year = yearOf(p);
      const years = byCategory.get(cat) ?? new Map<number, Patient[]>();
      const list = years.get(year) ?? [];
      list.push(p);
      years.set(year, list);
      byCategory.set(cat, years);
    }
    const catOrder = (c: string) => {
      const i = (DISORDER_CATEGORIES as readonly string[]).indexOf(c);
      return i === -1 ? DISORDER_CATEGORIES.length : i;
    };
    return Array.from(byCategory.entries())
      .sort((a, b) => catOrder(a[0]) - catOrder(b[0]))
      .map(([cat, years]) => ({
        cat,
        years: Array.from(years.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([year, list]) => ({
            year,
            patients: list.sort(
              (a, b) => new Date(b.archivedAt ?? 0).getTime() - new Date(a.archivedAt ?? 0).getTime(),
            ),
          })),
      }));
  }, [data.patients, user]);

  const total = tree.reduce((s, c) => s + c.years.reduce((y, g) => y + g.patients.length, 0), 0);
  const therapistName = (id: string | null) => data.therapists.find((th) => th.id === id)?.name ?? "";

  return (
    <div className="max-w-4xl mx-auto">
      <button type="button" onClick={onBack} className="text-sm font-semibold mb-3"
        style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {t("backToOverview")}
      </button>
      <SectionTitle sub={t("archiveSub")}>{t("archiveTitle")} ({total})</SectionTitle>

      {total === 0 && (
        <Card className="p-5"><p className="text-sm" style={{ color: C.muted }}>{t("archiveEmpty")}</p></Card>
      )}

      {tree.map(({ cat, years }) => {
        const n = years.reduce((s, g) => s + g.patients.length, 0);
        const isOpen = open.has(cat);
        return (
          <Card key={cat} className="mb-3">
            <button type="button" onClick={() => toggle(cat)} className="w-full text-left px-5 py-4 flex items-center gap-3"
              style={{ background: "none", border: "none", cursor: "pointer" }}>
              <span className="text-sm" style={{ color: C.muted }}>{isOpen ? "▾" : "▸"}</span>
              <span className="lc-display text-lg" style={{ color: C.ink }}>{trCategory(cat, lang)}</span>
              <span className="text-sm" style={{ color: C.muted }}>({n})</span>
            </button>
            {isOpen && (
              <div className="px-5 pb-4">
                {years.map(({ year, patients }) => (
                  <div key={year} className="mb-3">
                    <p className="text-xs font-bold mb-2 flex items-center gap-2" style={{ color: C.muted }}>
                      <span style={{ color: C.spruce }}>▸</span> {year}
                    </p>
                    <div className="flex flex-col gap-2">
                      {patients.map((p) => (
                        <button key={p.id} type="button" onClick={() => onOpenPatient(p.id)}
                          className="w-full text-left rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap"
                          style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, cursor: "pointer" }}>
                          <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: p.color }} />
                          <span className="font-semibold text-sm" style={{ color: C.ink, minWidth: 130 }}>{p.name}</span>
                          <OutcomeChip outcome={p.archiveOutcome} />
                          {p.archivedAt && <span className="text-xs" style={{ color: C.muted }}>{fmtDate(p.archivedAt)}</span>}
                          {user.role === "director" && (
                            <span className="ml-auto text-xs" style={{ color: C.muted }}>{therapistName(p.therapistId)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
