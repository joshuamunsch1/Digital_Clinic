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
  SDQ_SERIES,
  THERAPISTS,
  buildDipsAnswers,
  phq4SessionsFor,
  pstbSessionsFor,
} from "./demo";
import { exportPatientArchive } from "./archive-export";
import { toFHIR } from "./dips/fhir";
import { DOC_TITLES_DE, type DocType } from "./document-types";
import { readTemplate, storeDocumentFile, wipeDocumentsDir } from "./documents";
import { loadInstrumentDefs } from "./instruments/catalog";
import { computeScaleScores } from "./instruments/scoring";
import { hasFullWording, isFillable, isScoreable, type InstrumentDef, type RawAnswers } from "./instruments/types";
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
  conductedById?: string | null;
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
      conductedById: r.conductedById ?? null,
      meta: JSON.stringify(r.meta ?? {}),
      scaleScores: {
        create: Object.entries(scores).map(([key, value]) => ({ scaleId: scaleIds[key], value })),
      },
    },
  });
}

/// Demo timeline documents: copies of the placeholder template PDFs, filed on
/// disk exactly like live uploads. Mara has the complete standard set, Elif
/// shows recurring reports with goals still pending, David a partial checklist.
async function seedDocuments(prisma: PrismaClient) {
  await wipeDocumentsDir();
  const seedDoc = async (
    patientId: string,
    docType: DocType,
    daysAgo: number,
    uploadedById: string,
    title?: string,
  ) => {
    const bytes = await readTemplate(docType);
    if (!bytes) return; // template missing — skip silently (dev checkout without templates/)
    const row = await prisma.patientDocument.create({
      data: {
        patientId,
        docType,
        title: title ?? DOC_TITLES_DE[docType],
        fileName: `${docType}.pdf`,
        mimeType: "application/pdf",
        size: bytes.length,
        storagePath: "",
        uploadedById,
        occurredAt: new Date(Date.now() - daysAgo * 864e5),
      },
    });
    const storagePath = await storeDocumentFile(patientId, row.id, "application/pdf", bytes);
    await prisma.patientDocument.update({ where: { id: row.id }, data: { storagePath } });
  };

  // p1 Mara Vogel (t1): complete standard checklist
  await seedDoc("p1", "consent", 84, "t1");
  await seedDoc("p1", "confidentiality", 84, "t1");
  await seedDoc("p1", "emergency_contacts", 80, "t1");
  await seedDoc("p1", "personal_goals", 70, "t1");
  await seedDoc("p1", "report", 30, "t1", "Therapiebericht — Zwischenbericht");
  // p3 Elif Demir (t1): recurring reports, personal goals still pending
  await seedDoc("p3", "consent", 60, "t1");
  await seedDoc("p3", "confidentiality", 60, "t1");
  await seedDoc("p3", "emergency_contacts", 55, "t1");
  await seedDoc("p3", "report", 60, "d1", "Therapiebericht — Eingangsbericht");
  await seedDoc("p3", "report", 7, "t1", "Therapiebericht — Zwischenbericht");
  // p2 David Hofmann (t2): partial — three standard documents still pending
  await seedDoc("p2", "consent", 45, "t2");
  await seedDoc("p2", "confidentiality", 45, "t2");
}

/// Demo questionnaire invitations for the monitoring view. Deliberately NO open
/// LimeSurvey rows (they would carry fake tokens and every sync/sweep would log
/// errors against a nonexistent server): open rows are in-app tasks, the
/// LimeSurvey rows are already closed (completed / error).
async function seedInvitations(prisma: PrismaClient, instruments: Map<string, SeededInstrument>) {
  const defs = [...instruments.values()].map((x) => x.def);
  const inApp =
    defs.find(
      (d) =>
        d.id !== SESSION_INSTRUMENT_ID &&
        d.id !== DIPS_INSTRUMENT_ID &&
        d.instrumentType === "likert_battery" &&
        isFillable(d) &&
        hasFullWording(d),
    ) ?? defs.find((d) => d.id === SESSION_INSTRUMENT_ID)!;
  const day = 864e5;
  const now = Date.now();
  // context.sessionNumber only makes sense for per-session instruments — the
  // ledger link (sessionLogId) works either way.
  const ctxForSession = (n: number) =>
    inApp.cadenceType === "every_session" ? JSON.stringify({ sessionNumber: n }) : "{}";

  // p1 Mara (t1): fresh in-app task, sent from the after-session step of her
  // held session 9 — the ledger shows "Sitzung 9 · … offen"
  await prisma.questionnaireInvitation.create({
    data: {
      patientId: "p1", instrumentId: inApp.id, respondentRole: "self",
      email: "mara.vogel@example.org", channel: "in_app",
      sessionLogId: "sl-p1-s9", context: ctxForSession(9),
      createdAt: new Date(now - 2 * day),
    },
  });
  // p3 Elif (t1): in-app task from 12 days ago with a weekly cadence → overdue
  await prisma.questionnaireInvitation.create({
    data: {
      patientId: "p3", instrumentId: inApp.id, respondentRole: "self",
      email: "elif.demir@example.org", channel: "in_app",
      remindEveryDays: 7, createdAt: new Date(now - 12 * day),
    },
  });
  // p3 Elif: request for her held session 10 that was never answered —
  // closed as "no_response" (terminal, distinct from cancelled)
  await prisma.questionnaireInvitation.create({
    data: {
      patientId: "p3", instrumentId: inApp.id, respondentRole: "self",
      email: "elif.demir@example.org", channel: "in_app",
      sessionLogId: "sl-p3-s10", context: ctxForSession(10),
      status: "no_response",
      createdAt: new Date(now - 38 * day),
    },
  });
  // p5 Camille (t2): completed LimeSurvey invitation after one reminder
  await prisma.questionnaireInvitation.create({
    data: {
      patientId: "p5", instrumentId: "edeq8", respondentRole: "self",
      email: "camille.perret@example.org", surveyId: "100001",
      status: "completed", reminderCount: 1,
      sentAt: new Date(now - 20 * day), remindedAt: new Date(now - 15 * day),
      completedAt: new Date(now - 13 * day), createdAt: new Date(now - 20 * day),
    },
  });
  // p2 David (t2): failed delivery — demos the error surface
  await prisma.questionnaireInvitation.create({
    data: {
      patientId: "p2", instrumentId: "bdi_fs", respondentRole: "self",
      email: "david.hofmann@example.org",
      status: "error", lastError: "LimeSurvey is not configured",
      createdAt: new Date(now - 5 * day),
    },
  });
}

export async function seedClinic(prisma: PrismaClient) {
  await prisma.scaleScore.deleteMany();
  await prisma.responseInstance.deleteMany();
  await prisma.questionnaireInvitation.deleteMany();
  await prisma.patientDocument.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.therapyGoal.deleteMany();
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
        // The portal's intake to-do keys on assessmentDate, not status — a
        // patient seeded with demographics must carry one (the DIPS date is
        // the deterministic stand-in when no session dates exist).
        assessmentDate: sessions.length
          ? new Date(sessions[0].date)
          : Object.keys(p.demographics).length
            ? new Date(p.dips.completedAt)
            : null,
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

    // Session ledger (§4.5): held sessions (numbered), cancellations, no-shows.
    // Fixed ids let seedInvitations link requests to their ledger entry.
    for (const log of p.sessionLogs ?? []) {
      await prisma.sessionLog.create({
        data: {
          id: log.id,
          patientId: p.id,
          occurredAt: new Date(now - log.daysAgo * 864e5),
          type: log.type,
          sessionNumber: log.sessionNumber ?? null,
          conductedById: p.therapistId,
          note: log.note ?? "",
        },
      });
    }

    // GAS therapy goals. Ratings are attributed by staff display name (the
    // assigned therapist), matching the goals route's `by: s.name` convention;
    // createdAt is staggered so the goal order stays stable.
    const goalBy = THERAPISTS.find((th) => th.id === p.therapistId)?.name ?? DIRECTOR.name;
    for (const [gi, g] of (p.goals ?? []).entries()) {
      const ratings = (g.ratings ?? [])
        .map((r) => ({
          at: r.at ?? new Date(now - (r.daysAgo ?? 0) * 864e5).toISOString(),
          level: r.level,
          by: goalBy,
        }))
        .sort((a, b) => a.at.localeCompare(b.at));
      await prisma.therapyGoal.create({
        data: {
          patientId: p.id,
          title: g.title,
          levels: JSON.stringify(g.levels),
          ratings: JSON.stringify(ratings),
          createdAt: new Date(now - 60 * 864e5 + gi * 60000),
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

    // Therapist-administered DIPS interviews (respondentRole "clinician" since
    // the intake split — the patient intake collects demographics only). Every
    // demo patient has one so the diagnosis view opens on all dossiers.
    {
      const lang = "de" as const;
      const answers = buildDipsAnswers(p.dips.positive);
      const fhir = toFHIR(
        { id: p.id, name: p.name, demographics: p.demographics },
        { answers, lang, completedAt: p.dips.completedAt },
      );
      await createScoredResponse(prisma, {
        patientId: p.id,
        instrument: dips,
        respondentRole: "clinician",
        conductedById: p.therapistId,
        occurredAt: new Date(p.dips.completedAt),
        rawAnswers: answers,
        meta: {
          lang,
          fhir,
          submission: { status: "sent", endpoint: "clinic database (no external relay)", at: p.dips.completedAt },
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

  await seedDocuments(prisma);
  await seedInvitations(prisma, instruments);

  return {
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    instruments: await prisma.instrument.count(),
    scales: await prisma.scale.count(),
    responses: await prisma.responseInstance.count(),
    scaleScores: await prisma.scaleScore.count(),
    documents: await prisma.patientDocument.count(),
    sessionLogs: await prisma.sessionLog.count(),
    simulated,
  };
}
