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

**Batch 3 (2026-07-03)**: **SBKJ-P** (child/adolescent session form) brought to the same
fidelity as PSTB — real 7-item German wording + verified 0..6 scale from In-Albon et al.
(2021), replacing placeholder ids/assumed range (`catalog.ts` `sbkj_child` case).
**Per-session therapist attribution** added: `ResponseInstance.conductedById` (mirrors
the legacy PSTB Hilfsskript's `TherapeutIn` column), defaulted server-side from the
patient's current `therapistId`, overridable via a "conducted by" picker in
`InstrumentForm` clinician mode for `every_session` instruments, surfaced in
`PatientDetail`'s response list. Full audit of every legacy `.sps`/`.R` data-processing
script against this codebase's coverage — see `docs/pipeline-coverage.md` — surfaced
exact formulas for BSI/IIP-64/DERS/SIAS/PHQ-4/YSR/FRKJ/FEEL-KJ/TAIK/full-EDE/DEBQ/WBQ
(none yet wired into the catalog — still `partial`/`not_extracted`/absent, but no longer
a research gap) plus several legacy `.sps` scoring bugs *not* to replicate (`BSI_GSI`
SUM-vs-MEAN, `TAIK_6` double-counted, EDE completeness-guard threshold, `WBQ` raw-column
naming inconsistency — all documented in `legacy-system-reference.md`). One latent bug
fixed: `cbcl_parent`'s placeholder item id didn't match the "keep partial entries inert"
filter and would have rendered one bogus fillable field.

**Batch 4 (2026-07-03)**: `docs/outcome-prediction.md` — summary of Wolfgang Lutz's
patient-focused research (ETR, failure boundaries, nearest neighbors, Trier Treatment
Navigator, sudden gains) with a staged analytics roadmap and a data-collection
checklist (treatment-end/dropout labels, intake predictors, patient codes, session
log — all still TODO). One data change shipped: **PHQ-4 seeded as a second
every-session instrument** (code-defined in `catalog.ts` like DIPS; public-domain
German wording, PHQ_total verified against legacy syntax, GAD-2/PHQ-2 subscales,
norm bands) so session-wise symptom trajectories accumulate from day one.

**Batch 5 (2026-07-03)**: **Patient archive** — `Patient.status` gains
`"archived"` plus `archivedAt`/`archiveOutcome`/`archivedBy`; the director or the
assigned therapist concludes a treatment from `PatientDetail` (two-step confirm,
optional outcome label `completed`/`dropout` — the first treatment-end label from
`docs/outcome-prediction.md` §4). Archived patients leave every active overview
and live in `ArchiveView` (separate full-screen view, low-prominence link at the
dashboard bottom; category ▸ year-of-conclusion ▸ patient tree; director sees
all, therapists their own, admin none). Archiving also writes a **filesystem
export** (`src/lib/archive-export.ts`: `ARCHIVE_DIR`/category/year/patient/ with
`patient.json` + per-instrument trajectory CSVs; best-effort — a disk failure
never blocks the archive action; reopening leaves files on disk). **Manual
registration** (director/admin) now takes optional e-mail + demographics
(uniqueness checked against patients *and* staff, no password). **i18n
completion**: `DipsSummary` no longer renders with hard-coded `"en"`; `fmtDate`
follows the UI language (de-CH/fr-CH/en-GB via `setFmtLang` from `LangProvider`);
data-model slugs (rater roles, cadence, population, response source, invitation
status, canonical sex/living values) are translated on display via helpers in
`i18n.ts`; the catalog's English scale labels, BDI norm-band labels and the BDI
alert message were Germanized (stored clinical content is German by convention —
PHQ-4/SRS already were). Demo free text (staff titles, occupations, diagnoses)
Germanized; 4 archived demo patients (2 categories × 2024/2025) seed the archive
including the disk export.

**Batch 6 (2026-07-07, branch `feature/lutz-outcome-prediction`)**: the full
`docs/outcome-prediction.md` roadmap (all 3 stages), with a **simulated
reference cohort** standing in for the missing archive — see that doc's §7
implementation notes. Schema: `Patient.code` (A00120-style pseudonym,
auto-assigned), `icdCode`, `treatmentStartAt/treatmentEndAt`,
`terminationReason` (5-code, REQUIRED at archive — replaces `archiveOutcome`;
dropout = therapist judgment per clinic decision §6.2), `caseCharacteristics`
JSON (coded ETR intake predictors), `simulated` flag, new `SessionLog` model
(sessions without questionnaires, §4.5). Pure analytics in
`src/lib/analytics/` (suddengains-exact sudden shifts, RCI early change,
percentile expected-course bands — displayed p25–p75, NOT flag on the p10/p90
80% boundary — dynamic Gower nearest neighbors, two-stage log-linear ETR
approximation, L2-logistic dropout risk; 57 tests via `npm test`, node:test
through tsx). Server: cached reference sample with an aggregate version probe
(`src/lib/prediction/`), staff-only prediction routes
(`/api/patients/[id]/prediction`, `/api/predictions/summary`), director-only
§5 research-export CSVs (`/api/export/research`, simulated rows excluded by
default); `/api/clinic` ships archived patients as summary rows (full dossier
fetched on open — a 250-case archive would dominate the payload). Simulation:
deterministic generative cohort with planted predictor signal
(`src/lib/simulation/`, master seed 20260706, `SIM_COHORT_SIZE` env override,
`npm run sim:purge` = real-data cutover), 10 scripted active patients demoing
each feedback state. UI: `PredictionPanel` (source toggle clinic/NN/ETR,
dropout gauge with n + base rate + AUC, NN research codes only), chart
overlays band/boundary/ETR/diamonds (LineChart→ComposedChart), amber NOT
banner distinct from red safety alerts, dashboard badges, SIM chips,
"Simulierte Referenzdaten" badge on every prediction surface. `rci` params
added for `phq4/PHQ_total` (Löwe-derived) and `pstb/Therapiefortschritte`
(PLACEHOLDER, flagged). Predictions are therapist-facing only — patient and
admin sessions get 403 before anything is computed.

**Batch 7 (2026-07-10)**: **documents + monitoring** shipped on main
(`PatientDocument` timeline with expected checklist + placeholder PDFs in
`templates/documents/`, disk storage under `DOCUMENTS_DIR`; `MonitoringView`
per-therapist questionnaire monitoring; invitation `channel` `limesurvey|in_app`
— in-app tasks fill in the patient portal and complete the invitation;
automatic periodic reminders via `src/lib/reminder-sweep.ts` + instrumentation
hook, `REMINDER_SWEEP_MINUTES`/`REMINDER_SWEEP_SECRET`), then
`feature/lutz-outcome-prediction` was **merged into main** (both worlds
coexist; `patientForSession()` in `serialize.ts` is the single role-scoping
entry point and strips documents + sessionLogs for patients).

**Batch 8 (2026-07-12)**: **DIPS-first diagnosis workflow.** Patient intake is
demographics-only (`AssessmentForm`); the DIPS is a **therapist-administered
interview** (`DipsForm`, staff-only `POST /api/patients/[id]/dips`,
`respondentRole "clinician"` + `conductedById`). The diagnosis card is gated:
no DIPS → "DIPS-Interview erforderlich" (server enforces 409 `dips_required`).
A **mechanical diagnosis** (`src/lib/dips/diagnosis.ts` — rule-based ICD-10
proposals F41.0/F40.00/.01/F40.1/F40.2/F41.1/F93.0 from screening + symptom
counts + impairment ≥4/8 + duration; organic/substance = caveats) pre-fills
the (editable) diagnosis form — proposed, never auto-saved. Full-window
`DiagnosisView` shows per-criterion checklists, the interview record,
**recommended questionnaires** and **guideline cards**
(`src/lib/recommendations.ts` — specific DIPS diagnosis first, category
fallback; AWMF S3 051-028/nvl-005/051-026/028-045 + Swiss SGAD; burnout has
NO S3 → ICD-11 QD85 note; catalog `wbq` is binge-eating, NOT burnout).
Recommended instruments are ★-marked and sorted first in both send-forms.
⚠ ALL thresholds/mappings are flagged `[clinician-confirm]` — DIPS-OA manual
numerics were not verifiable; treat as prototype values pending clinical
review.

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
5. **`docs/pipeline-coverage.md`** — master cross-reference of every legacy
   `.sps`/`.R` script found in the source clinic's data folder against this codebase:
   what's fully implemented and verified (PSTB, SBKJ-P, BDI-FS, DIKJ, FGG, EDE-Q8, SDQ),
   what's a placeholder only (the two big composite batteries — BSI, IIP-64, DERS,
   SIAS, PHQ-4, YSR, CBCL, FRKJ, FEEL-KJ, TAIK/TAIE, full EDE, DEBQ, WBQ, Conners 3,
   SCID-5-SPQ, Somatik, SRS), and which parts of the old R reporting pipeline are
   obviated by the new architecture rather than missing. Read this before starting work
   on any instrument not in the "fully implemented" list — the formulas are usually
   already documented in `legacy-system-reference.md`, so it's transcription work, not
   research.

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
