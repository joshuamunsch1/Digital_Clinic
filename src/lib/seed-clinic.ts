// Reusable seeding routine (used by prisma/seed.ts and the /api/seed reset route).
import type { PrismaClient } from "@prisma/client";
import { DEMO_PATIENTS, DIRECTOR, SAMPLE_ANSWERS, THERAPISTS, entriesFor } from "./demo";
import { toFHIR } from "./dips/fhir";

export async function seedClinic(prisma: PrismaClient) {
  await prisma.dipsSubmission.deleteMany();
  await prisma.wellbeingEntry.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();

  for (const u of [...THERAPISTS, DIRECTOR]) {
    await prisma.user.create({ data: { id: u.id, name: u.name, title: u.title, role: u.role } });
  }

  for (const p of DEMO_PATIENTS) {
    const entries = entriesFor(p.levels);
    await prisma.patient.create({
      data: {
        id: p.id,
        name: p.name,
        color: p.color,
        status: p.status,
        therapistId: p.therapistId,
        demographics: JSON.stringify(p.demographics),
        assessmentDate: entries.length ? new Date(entries[0].date) : null,
        diagnosisText: p.diagnosis,
        diagnosisDate: p.diagnosis ? new Date("2026-03-10T09:00:00.000Z") : null,
        diagnosisBy: p.diagnosis ? "Intake interview" : null,
        entries: {
          create: entries.map((e) => ({
            session: e.session,
            type: e.type,
            date: new Date(e.date),
            scores: JSON.stringify(e.scores),
            note: e.note,
          })),
        },
      },
    });

    if (p.hasSampleDips) {
      const completedAt = "2026-03-09T10:00:00.000Z";
      const lang = "de" as const;
      const fhir = toFHIR(
        { id: p.id, name: p.name, demographics: p.demographics },
        { answers: SAMPLE_ANSWERS, lang, completedAt },
      );
      await prisma.dipsSubmission.create({
        data: {
          patientId: p.id,
          lang,
          completedAt: new Date(completedAt),
          answers: JSON.stringify(SAMPLE_ANSWERS),
          fhir: JSON.stringify(fhir),
          submissionStatus: "sent",
          httpStatus: null,
          endpoint: "clinic database (no external relay)",
        },
      });
    }
  }

  return {
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    entries: await prisma.wellbeingEntry.count(),
    dips: await prisma.dipsSubmission.count(),
  };
}
