// Reusable seeding routine (used by prisma/seed.ts and the /api/seed reset route).
// Seeds the instrument catalog (docs/instrument-catalog.json + clinic-internal
// instruments) and fictional demo patients whose questionnaire data lives in the
// generic ResponseInstance/ScaleScore model.
import type { PrismaClient } from "@prisma/client";
import {
  BDI_FS_SERIES,
  DEMO_PATIENTS,
  DIRECTOR,
  SAMPLE_ANSWERS,
  SDQ_SERIES,
  THERAPISTS,
  checkinsFor,
} from "./demo";
import { toFHIR } from "./dips/fhir";
import { loadInstrumentDefs } from "./instruments/catalog";
import { computeScaleScores } from "./instruments/scoring";
import { isScoreable, type InstrumentDef, type RawAnswers } from "./instruments/types";
import { CHECKIN_INSTRUMENT_ID, DIPS_INSTRUMENT_ID } from "./types";

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
      const row = await prisma.scale.create({
        data: {
          instrumentId: def.id,
          key: s.key,
          label: s.label,
          formula: JSON.stringify(s.formula),
          normBands: s.normBands ? JSON.stringify(s.normBands) : null,
          range: s.range ? JSON.stringify(s.range) : null,
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
  await prisma.scale.deleteMany();
  await prisma.instrument.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();

  for (const u of [...THERAPISTS, DIRECTOR]) {
    await prisma.user.create({ data: { id: u.id, name: u.name, title: u.title, role: u.role } });
  }

  const instruments = await seedInstruments(prisma);
  const checkin = instruments.get(CHECKIN_INSTRUMENT_ID)!;
  const dips = instruments.get(DIPS_INSTRUMENT_ID)!;
  const bdi = instruments.get("bdi_fs")!;
  const sdqSelf = instruments.get("sdq_self_11_17")!;
  const sdqParent = instruments.get("sdq_parent_4_17")!;
  const now = Date.now();

  for (const p of DEMO_PATIENTS) {
    const checkins = checkinsFor(p.levels);
    await prisma.patient.create({
      data: {
        id: p.id,
        name: p.name,
        email: p.email,
        color: p.color,
        status: p.status,
        therapistId: p.therapistId,
        demographics: JSON.stringify(p.demographics),
        assessmentDate: checkins.length ? new Date(checkins[0].date) : null,
        diagnosisText: p.diagnosis,
        diagnosisDate: p.diagnosis ? new Date("2026-03-10T09:00:00.000Z") : null,
        diagnosisBy: p.diagnosis ? "Intake interview" : null,
      },
    });

    for (const e of checkins) {
      await createScoredResponse(prisma, {
        patientId: p.id,
        instrument: checkin,
        respondentRole: "self",
        sessionNumber: e.session,
        occurredAt: new Date(e.date),
        rawAnswers: e.answers,
        note: e.note,
      });
    }

    if (p.hasBdiSeries) {
      for (const b of BDI_FS_SERIES) {
        await createScoredResponse(prisma, {
          patientId: p.id,
          instrument: bdi,
          respondentRole: "self",
          occurredAt: new Date(now - b.daysAgo * 864e5),
          rawAnswers: b.answers,
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
  }

  return {
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    instruments: await prisma.instrument.count(),
    scales: await prisma.scale.count(),
    responses: await prisma.responseInstance.count(),
    scaleScores: await prisma.scaleScore.count(),
  };
}
