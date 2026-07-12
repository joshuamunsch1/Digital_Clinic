import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { csvDocument } from "@/lib/csv";

// Pseudonymized long-format research export (docs/outcome-prediction.md §5) —
// the handover point to R/lme4/brms and research cooperations. Director-only,
// network-gated. Two levels: ?level=scores (default; one row per patient ×
// occasion × scale) and ?level=items (one row per response × item).
// Simulated patients are EXCLUDED by default so a real export never contains
// synthetic rows; ?includeSimulated=1 opts them in for demo purposes.
// Rule: flat files derived from the DB, never the DB itself — no names or
// e-mail addresses ever leave the system (patients appear as their research
// code, staff as stable T-pseudonyms).

const SCORES_HEADER = [
  "patient_code",
  "disorder_category",
  "age",
  "sex",
  "therapist_pseudonym",
  "treatment_start",
  "treatment_end",
  "termination_reason",
  "instrument",
  "scale_key",
  "value",
  "session_number",
  "wave",
  "measurement_index",
  "occurred_at",
  "respondent_role",
  "source",
  "conducted_by_pseudonym",
  "response_status",
];

const ITEMS_HEADER = [
  "patient_code",
  "instrument",
  "item_id",
  "value",
  "session_number",
  "wave",
  "measurement_index",
  "occurred_at",
  "respondent_role",
  "source",
  "response_status",
];

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const isoDate = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "director") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const url = new URL(req.url);
  const level = url.searchParams.get("level") === "items" ? "items" : "scores";
  const includeSimulated = url.searchParams.get("includeSimulated") === "1";

  // Stable staff pseudonyms over ALL staff (conducted_by may be the director),
  // ordered by creation so the mapping never shifts as staff are added.
  const staff = await prisma.user.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  const pseudonym = new Map(staff.map((u, i) => [u.id, `T${String(i + 1).padStart(2, "0")}`]));

  const patients = await prisma.patient.findMany({
    where: { code: { not: null }, ...(includeSimulated ? {} : { simulated: false }) },
    orderBy: { code: "asc" },
    select: {
      code: true,
      disorderCategory: true,
      demographics: true,
      therapistId: true,
      treatmentStartAt: true,
      treatmentEndAt: true,
      terminationReason: true,
      responses: {
        orderBy: { occurredAt: "asc" },
        select: {
          instrumentId: true,
          respondentRole: true,
          sessionNumber: true,
          wave: true,
          occurredAt: true,
          rawAnswers: true,
          status: true,
          source: true,
          conductedById: true,
          scaleScores: { select: { value: true, scale: { select: { key: true, sortOrder: true } } } },
        },
      },
    },
  });

  const rows: (string | number | null)[][] = [];
  for (const p of patients) {
    const demographics = parseJson<{ age?: string | number; sex?: string }>(p.demographics, {});
    // 1-based chronological ordinal per (patient, instrument, respondent) —
    // the third time axis next to session_number and wave.
    const measurementCounter = new Map<string, number>();
    for (const r of p.responses) {
      const counterKey = `${r.instrumentId}|${r.respondentRole}`;
      const measurementIndex = (measurementCounter.get(counterKey) ?? 0) + 1;
      measurementCounter.set(counterKey, measurementIndex);

      if (level === "scores") {
        const scores = [...r.scaleScores].sort((a, b) => a.scale.sortOrder - b.scale.sortOrder);
        for (const sc of scores) {
          rows.push([
            p.code,
            p.disorderCategory ?? "",
            demographics.age != null ? String(demographics.age) : "",
            demographics.sex ?? "",
            p.therapistId ? pseudonym.get(p.therapistId) ?? "" : "",
            isoDate(p.treatmentStartAt),
            isoDate(p.treatmentEndAt),
            p.terminationReason ?? "",
            r.instrumentId,
            sc.scale.key,
            sc.value,
            r.sessionNumber ?? "",
            r.wave ?? "",
            measurementIndex,
            r.occurredAt.toISOString(),
            r.respondentRole,
            r.source,
            r.conductedById ? pseudonym.get(r.conductedById) ?? "" : "",
            r.status,
          ]);
        }
      } else {
        const answers = parseJson<Record<string, unknown>>(r.rawAnswers, {});
        for (const [itemId, value] of Object.entries(answers)) {
          if (value === null || value === undefined) continue;
          rows.push([
            p.code,
            r.instrumentId,
            itemId,
            typeof value === "object" ? JSON.stringify(value) : String(value),
            r.sessionNumber ?? "",
            r.wave ?? "",
            measurementIndex,
            r.occurredAt.toISOString(),
            r.respondentRole,
            r.source,
            r.status,
          ]);
        }
      }
    }
  }

  const csv = csvDocument(level === "scores" ? SCORES_HEADER : ITEMS_HEADER, rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="linden-research-${level}-${stamp}.csv"`,
    },
  });
}
