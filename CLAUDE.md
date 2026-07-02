# Linden Clinic — project context for AI coding agents

Read this before making schema or architecture changes.

## What this project is

A prototype therapy-progress platform (Next.js 14 App Router + TypeScript + Prisma/SQLite
+ recharts + Tailwind). See `README.md` for stack, scripts, and how to run it locally.

The goal is to digitize the workflow of a real outpatient psychotherapy clinic:
patients periodically fill out standardized clinical questionnaires (mostly via
LimeSurvey), the system scores them, and therapists/the clinic director see each
patient's scores plotted over time ("trajectories") per questionnaire.

**The generic instrument engine is implemented** (July 2026): `Instrument` / `Scale` /
`ResponseInstance` / `ScaleScore` Prisma models, a formula-interpreting scoring engine
(`src/lib/instruments/scoring.ts`), a catalog loader that seeds
`docs/instrument-catalog.json` (`src/lib/instruments/catalog.ts`), a generic
`likert_battery` form renderer (`src/components/InstrumentForm.tsx`), generalized
trajectory charts/score tables (`src/components/charts.tsx`), and a LimeSurvey
RemoteControl-2 integration with invitation/reminder tracking, completion sync and a
manual CSV-import fallback (`src/lib/limesurvey.ts`, `docs/limesurvey-integration.md`).
The old hard-coded `WellbeingEntry`/`DipsSubmission` tables are gone (hard cutover; DIPS
intakes are `ResponseInstance` rows with the FHIR payload in `meta`).

**Batch 2 (same day)**: real e-mail+password auth (scrypt + HMAC-signed sessions,
`src/lib/password.ts`/`auth.ts`) with public patient self-registration; an `admin` role
(assignment only — `patientLiteFromRow` strips clinical data); disorder-category
filtering; a director scores matrix + per-patient `SummaryStrip`; data-driven scale
`alert` (BDI-FS suicide item) and `rci` reliable-change markers
(`src/lib/instruments/rci.ts` — BDI/SDQ rci values are PLACEHOLDERS, flagged in notes);
DE (default)/FR/EN UI via `UI` dict in `i18n.ts` + `LangContext.tsx`; staff-only network
gate (`src/lib/network.ts`, `ALLOWED_NETWORK_CIDRS`). The session measure is now the
real **PSTB** — 22 German items (clinic-provided BSTB-PT.pdf), verified −3..+3 scale,
reverse items I8/I12/I14/I19 (the PDF's "items 10/11 umgepolt" note refers to the
therapist form); `wellbeing_checkin` was removed. Validated instrument wording stays
German in all UI languages.

## Reference documents

1. **`docs/legacy-system-reference.md`** — factual writeup of how the real clinic
   (anonymized data, analyzed directly) currently stores this data: an
   SPSS-file-per-instrument "database" plus an R pipeline that regenerates per-patient
   Word/Excel reports. Explains the instrument catalog and flags several
   `[UNCONFIRMED]` details that are assumptions, not verified facts — don't silently
   treat those as ground truth in generated code; surface them to the user instead.
2. **`docs/target-data-model.md`** — the design the current codebase implements.
3. **`docs/instrument-catalog.json`** — seed data for `Instrument`/`Scale`. Entries are
   tagged `itemSchemaStatus: "complete" | "partial" | "not_extracted"` (mirrored as
   `Instrument.definitionStatus`); only `complete` entries are rendered/scored — the
   others are seeded as visible-but-unscoreable placeholders. Item wording for
   licensed/copyrighted instruments (BDI, Conners, CBCL/YSR, DIKJ, etc.) was
   deliberately **not** reproduced; only the scoring structure was captured.
4. **`docs/limesurvey-integration.md`** — what the LimeSurvey API can do, the three
   response-ingestion options (webhook plugin / end-URL ping / polling), survey setup
   conventions (question codes = item ids, token-based closed access), and the open
   hosting/GDPR questions.

## Working conventions

- Catalog irregularities are normalized **explicitly per instrument** in
  `src/lib/instruments/catalog.ts` (DIKJ/FGG item expansion, SDQ parent clones), not
  guessed at generically. Unverified response ranges carry `rangeAssumed: true` and the
  UI shows the assumption.
- The `src/lib/dips/` engine (typed `Item`/`Section`/`Module`, `showIf` conditional
  visibility) is the template for `instrumentType: "structured_interview"` instruments
  (e.g. SCID-5-SPQ) — don't force those into the generic Likert-battery renderer.
- Scale formulas are pure data interpreted by `computeScaleScores()` — never `eval` JS;
  extend the small expression language in `scoring.ts` if a new formula shape appears.
- Flag any `[UNCONFIRMED]` item from `docs/legacy-system-reference.md` that a task
  touches, rather than silently picking an assumption.
