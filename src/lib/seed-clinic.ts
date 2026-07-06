// Reusable seeding routine (used by prisma/seed.ts and the /api/seed reset route).
// Seeds the instrument catalog (docs/instrument-catalog.json + the DIPS intake),
// staff accounts (director / administrator / therapists) and fictional demo
// patients whose questionnaire data lives in the generic model. Demo passwords
// are listed in src/lib/demo.ts and the README.
import type { PrismaClient } from "@prisma/client";
import {
  ADMIN,
  BDI_FS_ALERT_SERIES,
  BDI_FS_SERIES,
  DEMO_PASSWORDS,
  DEMO_PATIENTS,
  DIKJ_SERIES,
  DIRECTOR,
  EDEQ8_SERIES,
  FGG_SERIES,
  SAMPLE_ANSWERS,
  SDQ_SERIES,
  THERAPISTS,
  phq4SessionsFor,
  pstbSessionsFor,
} from "./demo";
import { exportPatientArchive } from "./archive-export";
import { toFHIR } from "./dips/fhir";
import { loadInstrumentDefs } from "./instruments/catalog";
import { computeScaleScores } from "./instruments/scoring";
import { isScoreable, type InstrumentDef, type RawAnswers } from "./instruments/types";
import { hashPassword } from "./password";
import { formatPatientCode } from "./patient-code";
import { SIM_COHORT_SIZE, seedSimulation } from "./simulation/seed-simulation";
import { DIPS_INSTRUMENT_ID, SESSION_INSTRUMENT_ID } from "./types";

interface SeededInstrument {
  def: InstrumentDef;
  scaleIds: Record<string, string>; // scale key -> Scale row id
}

async function seedInstruments(prisma: PrismaClient): Promise<Map<string, SeededInstrument>> {
  const out = new Map<string, SeededInstrument>();
  for (const def of loadInstrumentDefs()) {
    await prisma.instrument.create({
      data: {
        id: def.id,
        name: def.name,
        abbreviation: def.abbreviation,
        population: def.population,
        raterRole: def.raterRole,
        instrumentType: def.instrumentType,
        cadenceType: def.cadenceType,
        cadenceConfig: JSON.stringify(def.cadenceConfig),
        definitionStatus: def.definitionStatus,
        itemSchema: JSON.stringify(def.items),
        sourceNotes: def.sourceNotes,
      },
    });
    const scaleIds: Record<string, string> = {};
    for (const s of def.scales) {
      const meta: Record<string, unknown> = {};
      if (s.higherIsBetter !== undefined) meta.higherIsBetter = s.higherIsBetter;
      if (s.alert) meta.alert = s.alert;
      if (s.rci) meta.rci = s.rci;
      const row = await prisma.scale.create({
        data: {
          instrumentId: def.id,
          key: s.key,
          label: s.label,
          formula: JSON.stringify(s.formula),
          normBands: s.normBands ? JSON.stringify(s.normBands) : null,
          range: s.range ? JSON.stringify(s.range) : null,
          meta: JSON.stringify(meta),
          sortOrder: s.sortOrder,
        },
      });
      scaleIds[s.key] = row.id;
    }
    out.set(def.id, { def, scaleIds });
  }
  return out;
}

interface ResponseSeed {
  patientId: string;
  instrument: SeededInstrument;
  respondentRole: string;
  occurredAt: Date;
  rawAnswers: RawAnswers | Record<string, unknown>;
  sessionNumber?: number;
  wave?: string;
  note?: string;
  source?: string;
  meta?: Record<string, unknown>;
}

/// Create one response and its computed ScaleScores (the seed goes through the
/// same scoring engine as live submissions).
export async function createScoredResponse(prisma: PrismaClient, r: ResponseSeed) {
  const { def, scaleIds } = r.instrument;
  const scores = isScoreable(def)
    ? computeScaleScores(def.items, def.scales, r.rawAnswers as RawAnswers).scores
    : {};
  return prisma.responseInstance.create({
    data: {
      patientId: r.patientId,
      instrumentId: def.id,
      respondentRole: r.respondentRole,
      sessionNumber: r.sessionNumber ?? null,
      wave: r.wave ?? null,
      occurredAt: r.occurredAt,
      rawAnswers: JSON.stringify(r.rawAnswers),
      note: r.note ?? "",
      source: r.source ?? "seed",
      meta: JSON.stringify(r.meta ?? {}),
      scaleScores: {
        create: Object.entries(scores).map(([key, value]) => ({ scaleId: scaleIds[key], value })),
      },
    },
  });
}

export async function seedClinic(prisma: PrismaClient) {
  await prisma.scaleScore.deleteMany();
  await prisma.responseInstance.deleteMany();
  await prisma.questionnaireInvitation.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.scale.deleteMany();
  await prisma.instrument.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();

  const staff = [
    ...THERAPISTS.map((t) => ({ ...t, password: DEMO_PASSWORDS.therapist })),
    { ...DIRECTOR, password: DEMO_PASSWORDS.director },
    { ...ADMIN, password: DEMO_PASSWORDS.admin },
  ];
  for (const u of staff) {
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        title: u.title,
        role: u.role,
        email: u.email,
        passwordHash: hashPassword(u.password),
      },
    });
  }

  const instruments = await seedInstruments(prisma);
  const pstb = instruments.get(SESSION_INSTRUMENT_ID)!;
  const phq4 = instruments.get("phq4")!;
  const dips = instruments.get(DIPS_INSTRUMENT_ID)!;
  const bdi = instruments.get("bdi_fs")!;
  const sdqSelf = instruments.get("sdq_self_11_17")!;
  const sdqParent = instruments.get("sdq_parent_4_17")!;
  const edeq8 = instruments.get("edeq8")!;
  const fgg = instruments.get("fgg")!;
  const dikj = instruments.get("dikj")!;
  const now = Date.now();

  let codeSeq = 0;
  for (const p of DEMO_PATIENTS) {
    const sessions = pstbSessionsFor(p.levels, p.seriesEnd);
    const diagnosisDate = p.diagnosis ? new Date(p.diagnosedOn ?? "2026-03-10T09:00:00.000Z") : null;
    await prisma.patient.create({
      data: {
        id: p.id,
        name: p.name,
        email: p.email,
        passwordHash: hashPassword(DEMO_PASSWORDS.patient),
        color: p.color,
        status: p.status,
        disorderCategory: p.disorderCategory,
        code: formatPatientCode(++codeSeq),
        icdCode: p.icd ?? null,
        caseCharacteristics: JSON.stringify(p.caseCharacteristics ?? {}),
        therapistId: p.therapistId,
        demographics: JSON.stringify(p.demographics),
        assessmentDate: sessions.length ? new Date(sessions[0].date) : null,
        diagnosisText: p.diagnosis,
        diagnosisDate,
        diagnosisBy: p.diagnosis ? "Erstgespräch" : null,
        // Episode boundaries (§4.2): therapy starts with the diagnosis, ends at
        // the archive timestamp; the end label is therapist-coded.
        treatmentStartAt: diagnosisDate,
        treatmentEndAt: p.archived ? new Date(p.archived.at) : null,
        terminationReason: p.archived?.reason ?? null,
        archivedAt: p.archived ? new Date(p.archived.at) : null,
        archivedBy: p.archived ? DIRECTOR.name : null,
      },
    });

    // Sessions without questionnaires / cancellations / no-shows (§4.5).
    for (const log of p.sessionLogs ?? []) {
      await prisma.sessionLog.create({
        data: {
          patientId: p.id,
          occurredAt: new Date(now - log.daysAgo * 864e5),
          type: log.type,
          conductedById: p.therapistId,
          note: log.note ?? "",
        },
      });
    }

    for (const e of sessions) {
      await createScoredResponse(prisma, {
        patientId: p.id,
        instrument: pstb,
        respondentRole: "self",
        sessionNumber: e.session,
        occurredAt: new Date(e.date),
        rawAnswers: e.answers,
        note: e.note,
      });
    }

    // Session-wise PHQ-4 symptom trajectory alongside the PSTB (same occasions).
    for (const e of phq4SessionsFor(p.levels, p.seriesEnd)) {
      await createScoredResponse(prisma, {
        patientId: p.id,
        instrument: phq4,
        respondentRole: "self",
        sessionNumber: e.session,
        occurredAt: new Date(e.date),
        rawAnswers: e.answers,
      });
    }

    const simpleSeries: { flag: boolean | undefined; instrument: SeededInstrument; series: { daysAgo: number; answers: RawAnswers; wave?: string }[] }[] = [
      { flag: p.hasBdiSeries, instrument: bdi, series: BDI_FS_SERIES },
      { flag: p.hasBdiAlertSeries, instrument: bdi, series: BDI_FS_ALERT_SERIES },
      { flag: p.hasEdeq8Series, instrument: edeq8, series: EDEQ8_SERIES },
      { flag: p.hasFggSeries, instrument: fgg, series: FGG_SERIES },
      { flag: p.hasDikjSeries, instrument: dikj, series: DIKJ_SERIES },
    ];
    for (const { flag, instrument, series } of simpleSeries) {
      if (!flag) continue;
      for (const s of series) {
        await createScoredResponse(prisma, {
          patientId: p.id,
          instrument,
          respondentRole: "self",
          wave: s.wave,
          occurredAt: new Date(now - s.daysAgo * 864e5),
          rawAnswers: s.answers,
        });
      }
    }

    if (p.hasSdqSeries) {
      for (const s of SDQ_SERIES) {
        await createScoredResponse(prisma, {
          patientId: p.id,
          instrument: s.role === "self" ? sdqSelf : sdqParent,
          respondentRole: s.role,
          wave: s.wave,
          occurredAt: new Date(now - s.daysAgo * 864e5),
          rawAnswers: s.answers,
        });
      }
    }

    if (p.hasSampleDips) {
      const completedAt = "2026-03-09T10:00:00.000Z";
      const lang = "de" as const;
      const fhir = toFHIR(
        { id: p.id, name: p.name, demographics: p.demographics },
        { answers: SAMPLE_ANSWERS, lang, completedAt },
      );
      await createScoredResponse(prisma, {
        patientId: p.id,
        instrument: dips,
        respondentRole: "self",
        occurredAt: new Date(completedAt),
        rawAnswers: SAMPLE_ANSWERS,
        meta: {
          lang,
          fhir,
          submission: { status: "sent", endpoint: "clinic database (no external relay)", at: completedAt },
        },
      });
    }

    // Archived demo patients also get their filesystem export so the archive
    // folder tree is demonstrable right after db:seed. Best-effort, like the
    // live archive action.
    if (p.archived) {
      const res = await exportPatientArchive(prisma, p.id);
      if (!res.ok) console.warn(`seed: archive export failed for ${p.id}: ${res.error}`);
    }
  }

  // Simulated reference cohort (docs/outcome-prediction.md): ~SIM_COHORT_SIZE
  // archived labeled treatments + 10 scripted active patients, deterministic,
  // flagged simulated. Override with SIM_COHORT_SIZE=<n> (0 skips entirely);
  // `npm run sim:purge` removes it later without touching demo data.
  const envSize = process.env.SIM_COHORT_SIZE;
  const simSize = envSize !== undefined && envSize !== "" ? Number(envSize) : SIM_COHORT_SIZE;
  let simulated: Awaited<ReturnType<typeof seedSimulation>> | null = null;
  if (Number.isFinite(simSize) && simSize > 0) {
    simulated = await seedSimulation(prisma, instruments, {
      n: simSize,
      startCodeSeq: codeSeq + 1,
      therapistIds: THERAPISTS.map((t) => t.id),
    });
  }

  return {
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    instruments: await prisma.instrument.count(),
    scales: await prisma.scale.count(),
    responses: await prisma.responseInstance.count(),
    scaleScores: await prisma.scaleScore.count(),
    sessionLogs: await prisma.sessionLog.count(),
    simulated,
  };
}
