import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { buildOutcomes } from "@/lib/analytics/outcomes";
import {
  PRIMARY_CLINICAL_CUTOFF,
  PRIMARY_KEY,
  PRIMARY_TARGET,
  getReferenceData,
} from "@/lib/prediction/reference";

// Director-only treatment-outcome evaluation (Batch 13): Jacobson–Truax
// classification, pre–post effect size, termination mix and dose–response over
// the archived labeled episodes — computed server-side from the cached
// reference sample (archived patients reach the client only as summary rows).
// Same gating as the research export; patients/admin/therapists get 401/403
// before anything is computed.
export async function GET(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "director") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const ref = await getReferenceData(prisma);
  const scale = ref.scaleParamsByKey.get(PRIMARY_KEY);
  if (!scale) {
    return NextResponse.json({ error: "primary_target_unavailable" }, { status: 503 });
  }

  const result = buildOutcomes(
    ref.cases.map((c) => ({
      code: c.code,
      simulated: c.simulated,
      series: c.series[PRIMARY_KEY] ?? [],
      terminationReason: c.terminationReason,
      sessionCount: c.sessionCount,
      endYear: c.treatmentEndAt ? new Date(c.treatmentEndAt).getFullYear() : null,
    })),
    scale,
    PRIMARY_CLINICAL_CUTOFF,
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    reference: { n: ref.cases.length, includesSimulated: ref.includesSimulated },
    target: {
      instrumentId: PRIMARY_TARGET.instrumentId,
      scaleKey: PRIMARY_TARGET.scaleKey,
      rciCutoff: scale.rciCutoff,
      clinicalCutoff: PRIMARY_CLINICAL_CUTOFF,
      higherIsBetter: scale.higherIsBetter,
      range: scale.range ?? null,
    },
    points: result.points,
    summary: result.summary,
    excluded: result.excluded,
  });
}
