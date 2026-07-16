import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { buildExpectedCourse } from "@/lib/analytics/expected-course";
import { seriesKeyOf } from "@/lib/analytics/types";
import { PREDICTION_TARGETS, getReferenceData } from "@/lib/prediction/reference";
import type { ClinicCourse } from "@/lib/prediction/service";

// Pooled clinic expected-course bands + failure boundaries for the OVERVIEW
// chart (one band behind all patient lines). Deliberately NOT stratified and
// NOT filtered by disorder category: stratification is a per-patient-baseline
// concept (Stage 2), and category subsets of the reference cohort routinely
// fall below the per-occasion minN — a per-category band would flicker in and
// out of existence as filters change and mislead more than it helps.
export async function GET(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role === "patient" || s.role === "admin")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const ref = await getReferenceData(prisma);
  const courses: ClinicCourse[] = [];
  for (const t of PREDICTION_TARGETS) {
    const key = seriesKeyOf(t.instrumentId, t.scaleKey);
    const series = ref.cases.map((c) => c.series[key] ?? []).filter((xs) => xs.length > 0);
    const points = buildExpectedCourse(series);
    if (!points.length) continue;
    const hib = ref.scaleParamsByKey.get(key)?.higherIsBetter ?? true;
    courses.push({
      instrumentId: t.instrumentId,
      scaleKey: t.scaleKey,
      axis: t.axis,
      n: series.length,
      includesSimulated: ref.includesSimulated,
      points,
      // Same direction-aware p10/p90 line the per-patient NOT flag uses.
      failureBoundary: points.map((p) => ({ session: p.session, value: hib ? p.p10 : p.p90 })),
    });
  }
  return NextResponse.json({ courses });
}
