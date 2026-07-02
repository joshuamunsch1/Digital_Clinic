# Linden Clinic — project context for AI coding agents

Read this before making schema or architecture changes.

## What this project is

A prototype therapy-progress platform (Next.js 14 App Router + TypeScript + Prisma/SQLite
+ recharts + Tailwind). See `README.md` for stack, scripts, and how to run it locally.

The end goal is to digitize the workflow of a real outpatient psychotherapy clinic:
patients periodically fill out standardized clinical questionnaires, the system scores
them, and therapists/the clinic director see each patient's scores plotted over time
("trajectories") per questionnaire. Today's codebase only implements two hard-coded
special cases of this (a generic 6-dimension wellbeing check-in, and a single anxiety
intake interview called DIPS) — the real clinic uses ~15-20 distinct instruments with
different items, scoring rules, raters, and administration schedules.

## Before touching the data model, read these two documents

1. **`docs/legacy-system-reference.md`** — a factual writeup of how a real clinic
   (anonymized data, analyzed directly) currently stores this kind of data: an
   SPSS-file-per-instrument "database" plus an R pipeline that regenerates per-patient
   Word/Excel reports. Explains the instrument catalog (what each questionnaire is, who
   fills it out, how it's scored, how often it's administered) and flags several
   `[UNCONFIRMED]` details that are assumptions, not verified facts — don't silently
   treat those as ground truth in generated code; surface them to the user instead.
2. **`docs/target-data-model.md`** — the proposed generalization: replace the two
   hard-coded data shapes (`WellbeingEntry`, `DipsSubmission`) with a generic
   `Instrument` / `Scale` / `ResponseInstance` / `ScaleScore` model (draft Prisma schema
   included) that can represent any questionnaire as data, plus a generic scoring engine
   and a generalized version of the existing `charts.tsx` trajectory chart. Includes a
   suggested build order.

`docs/instrument-catalog.json` is machine-readable seed data for the `Instrument`/`Scale`
tables — some entries are fully verified (`itemSchemaStatus: "complete"`, e.g. PSTB,
BDI-FS, SDQ, DIKJ, FGG, EDE-Q8), others are only partially or not yet extracted
(`"partial"` / `"not_extracted"`, e.g. Conners 3, CBCL, SCID-5-SPQ) — check that field
before trusting an entry's item/scale detail. Item wording for licensed/copyrighted
instruments (BDI, Conners, CBCL/YSR, DIKJ, etc.) was deliberately **not** reproduced;
only the scoring structure was captured.

## Working conventions

- Keep `WellbeingEntry`/`DipsSubmission` migration as a hard cutover, not a long-lived
  parallel system — there's no real user data yet (`prisma/seed.ts` is fictional demo
  data), so there's no migration-safety reason to keep the old tables around once the
  generic model lands.
- The existing `src/lib/dips/` engine (typed `Item`/`Section`/`Module`, `showIf`
  conditional visibility) is a good template for `instrumentType: "structured_interview"`
  instruments (e.g. SCID-5-SPQ) — don't force those into the generic Likert-battery
  renderer meant for the simpler scale questionnaires.
- Flag any `[UNCONFIRMED]` item from `docs/legacy-system-reference.md` that a task
  touches, rather than silently picking an assumption.
