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

**Batch 9 (2026-07-13)**: **dossier/monitoring UX overhaul.** SummaryStrip
shows the value next to its bar, with a glyph legend (▲▼►– + bar) replacing
the "Grün = günstig" caption. **Every demo patient has a DIPS interview**
(`demo.ts`: per-module `DIPS_POSITIVE`/`DIPS_NEGATIVE` blocks +
`buildDipsAnswers(positive)`, `DemoPatient.dips` profile — p1 panic, p3 gad,
p6/p10 social, p7 phobia, p11 panic+agora, rest all-negative screens), so
the diagnosis view opens on all dossiers incl. archived; an existing DIPS
now overrides the assessment-stage gate. New staff-only
`GET /api/patients/[id]/dips/export` (JSON attachment: answers + FHIR +
relay status); download link and the relay-retry button live in
`DiagnosisView`; the dossier's "DIPS · Angst-Screening" card is gone.
DipsSummary's responses toggle names the screened-positive modules.
**One "Aufnahme & Diagnose" card** merged the diagnosis, demographics and
predictor summaries; editing happens in the full-window `IntakeEditView`
(AppShell view `intake-edit`) via new PATCH action `demographics`
(staff-only, NO status/assessmentDate side effects — deliberately NOT the
patient assessment route) + `caseCharacteristics`. **PredictionPanel sits
directly above the trajectory charts**; the NN band draws blue vs clinic
spruce so the source toggle is visible; **BDI-FS is a third prediction
target** on a measurement-index axis (`PREDICTION_TARGETS` gained
`axis: "session" | "index"`, `indexedSeriesOf()` in analytics/types, the
reference loader also takes wave/date rows; ETR stays session-axis-only;
chart overlays attach index points to the patient's chronological
occasions). The dossier's "Fragebogen erheben" panel was removed — **manual
paper-form entry and CSV import moved into MonitoringView** (collect-mode
select limesurvey/in_app/manual/csv; manual opens the clinician
`InstrumentForm` full-window with conducted-by). The monitoring e-mail field
shows for BOTH channels, defaults to the address on file, and a changed
address is persisted to `Patient.email` (uniqueness vs patients+staff →
409 `email_taken`; the in-app branch accepts the override too). Archived
patients are excluded from monitoring.

**Batch 10 (2026-07-15)**: **GAS therapy goals** (Zielerreichungsskala nach
Kiresuk & Sherman — clinic paper template: per goal a title + free-text
descriptions for levels +3/+2/+1 positive erwünschte Veränderung, 0
Ausgangslage/Ist-Zustand, −1 negative Veränderung). New `TherapyGoal` model
(`levels` JSON `{"-1".."3": string}`, `ratings` JSON `[{at, level, by}]` —
by-name attribution like `diagnosisBy`); staff-only
`/api/patients/[id]/goals` (POST create, PATCH
update/rate/removeRating/delete; director-or-assigned-therapist, archived →
400 `archived`, ≤10 goals, integer level −1..+3). Goals are
**patient-visible read-only** (deliberately NOT stripped in
`patientForSession`; rendered as read-only ladders in `PatientHome`). The
intake card's left column shows a goals summary (title + current-level chip
+ MiniTrend) under the diagnosis info; entry/edit/rating live in the
full-window **`GoalsView`** (AppShell view `goals`): `GoalLadder` cards
(5 rungs +3→−1, baseline 0 blue, current rung highlighted, `LevelPicker`
−1..+3 + date + rating history) and `GoalChart` in charts.tsx (fixed −1..3
axis, dashed "Ausgangslage" ReferenceLine at 0, tinted negative zone, one
PALETTE line per goal, toggle chips). Demo goals: p1 improving, p3 dips to
−1, p6 unrated, p10 archived with absolute 2024 rating dates; seeding
staggers `createdAt` for stable order. `personal_goals` stays a filed-PDF
doc type; the archive JSON export includes goals automatically via
`patientFromRow`.

**Batch 11 (2026-07-16)**: **platform reorganization & usability.** Dossier
(PatientDetail): sticky **quick-nav** with jump chips (Diagnose · Monitoring &
Einladungen · Prognose · Verlauf · Dokumente · Abschluss, conditional per
section; anchors `dossier-*` with scrollMarginTop); **patient quick-switcher**
(‹/select/› over the role-scoped active caseload, hidden on archived dossiers;
AppShell passes `switchList` + `onOpenPatient` preserving `view.from`, and now
renders PatientDetail with `key={patient.id}` so ALL local state resets per
patient); **ONE switchable questionnaire card** ("Fragebogen-Verläufe" select
over `instrumentsWithData`, default = most responses) replaces the stacked
per-instrument cards — `InstrumentCard` gained a `selector` slot and MUST be
rendered with `key={instrument.id}` (TrajectoryChart's visible-scale state
initializes lazily; a prop swap without remount breaks lines + overlay
gating); prediction overlays/PredictionPanel wiring unchanged. DocumentsPanel
moved to the bottom, directly above the archive card; SessionLogPanel +
InvitationsPanel are **collapsed by default** to one-line summaries
(`logSummary`/`invSummary`). Dashboard is **patient-first** (lists before the
development chart + scores matrix). New staff-only `GET
/api/predictions/course` returns pooled (NOT stratified, NOT category-
filtered) `ClinicCourse[]` per PREDICTION_TARGET (p25–p75 points + direction-
aware p10/p90 failureBoundary from `buildExpectedCourse` over the cached
reference); `GlobalChart` takes `courses?` and draws band/median/boundary
behind the patient lines when the selection is a target (session-axis rows
capped at the last measured session; index-axis attaches by occasion position,
never synthesizing labels; static normBands suppressed while active).

**Batch 12 (2026-07-17)**: **unified "Sitzungen & Fragebögen" panel** — session
logging and questionnaire monitoring are ONE workflow now. New shared
`SessionMonitoringPanel` (`src/components/SessionMonitoringPanel.tsx`) replaces
the dossier's `SessionLogPanel`+`InvitationsPanel` (variant `"dossier"`,
collapse-by-default card in `#dossier-monitoring`) AND MonitoringView's
per-patient block internals (variant `"monitoring"`, always expanded;
`ChannelChip`/`ScheduleEditor`/`NewRequestForm` moved into it). Schema:
`SessionLog.sessionNumber Int?` (held sessions only, 0 = baseline) and
`QuestionnaireInvitation.sessionLogId` FK (`onDelete: SetNull` — deleting a
mis-entered log unlinks, never deletes, the requests). **Integrated flow**:
logging a *held* session (suggested editable number via
`suggestNextSessionNumber` in `src/lib/session-numbers.ts` — max over held
logs / responses / OPEN invitation contexts, +1) chains into a pre-filled
send step (every-session likert instruments population-matched via
`populationMatches`, now exported from PatientHome; channel+email like
NewRequestForm; per-instrument "manuell erfassen" passes the session number
into the clinician `InstrumentForm`, which finally grew a visible
Sitzungsnummer input — manual entries used to save `sessionNumber: null`).
Cancellations/no-shows skip the step. The ledger shows per-session measurement
chips: linked invitations by FK + responses matched by `sessionNumber` (how
manual/CSV entries earn ✓). New terminal invitation status **`no_response`**
(PATCH action; open statuses only — `error` stays cancel-only; the closed set
lives as a comment in `src/lib/reminders.ts`; `remind` guard tightened to
`isOpenInvitation`; a LimeSurvey answer arriving after no_response is
deliberately NOT auto-imported). `POST session-log` returns
`{patient, sessionLog}`; invitations POST accepts `sessionLogId`. PatientHome
suppresses the standing every-session card when an open in_app invitation for
that instrument exists (invitation-driven task wins; standing card = fallback).
PatientDetail gained `configured` (limesurveyConfigured) + its own
manual-entry `InstrumentForm` takeover (state resets via `key={patient.id}`).
The misleading `sessionLogSub` copy was fixed: **NO analytics wiring — the
ledger is not consumed by any analysis yet**; `sessionSeriesOf` still reads
`ResponseInstance.sessionNumber` only (docs/outcome-prediction.md §4 item 5).
Demo: p1 held S9 linked to her fresh in-app task, p3 held S10 with a
`no_response` request. Panel lists derive from props every render — the
MonitoringView block does NOT remount on `patientUpdated` merges.
Same-day follow-up: the **director dashboard is analytics-first** (Therapieverlauf
+ Fragebogen-Übersicht right under the title/stats via a shared `analyticsBlocks`
fragment; therapists keep Batch 11's patient-first order); the dossier header
lost the big "Therapiefortschritt (letzte Sitzung)" number/arrow (i18n key
`latestProgress` removed); SummaryStrip pills show a signed since-last-
measurement delta next to the trend glyph (`MiniTrend` gained a `delta` prop —
delta color = glyph color, muted when stable).

**Batch 13 (2026-07-18)**: **feedback-informed therapy tools** — five analytics/
viz features, NO schema changes. ① **Attendance & adherence**
(`src/lib/analytics/attendance.ts` — the first consumer of the SessionLog
ledger, §4.5 TODO): `attendanceFeatures` dedupes the two ledger conventions
(live: held logs may duplicate measured sessions; sim: held rows only for
unmeasured, no sessionNumber); 3 rate columns feed the dropout model
(model-local in `dropout-risk.ts`, `encodeFeatures` untouched;
`predictDropoutRisk` gained an `attendance` param); `adherenceStats`
(Rücklauf = completed/(completed+no_response) — staff cancels/errors excluded)
in SessionMonitoringPanel; `AttendanceStrip` chips under every-session charts
(deliberately NOT in-axis — misses have no sessionNumber). ② **Alliance
monitoring** (`alliance.ts`): rupture = consecutive-session Therapiebeziehung
drop ≥ threshold; criterion hierarchy RCI → empirical |p05| of pooled reference
deltas (minN 30, tail prob [clinician-confirm]) → silent; NO raw-constant
fallback. `ALLIANCE_SERIES` (pstb_adult + sbkj_child) ride the reference lean
load free; `ReferenceData.allianceDeltas`; `PredictionPayload.alliance`; amber
OPEN diamond via `ChartPrediction.ruptures`/`ruptureScaleKey` — gating separate
from `overlay` (different scale keys, never co-render); ◇ Beziehungssignal line
in PredictionPanel. ③ **Item heatmap + Prozessprofil**
(`src/components/heatmap.tsx` HeatGrid — CSS grid, sequential single-hue ramp
light→dark=worse (CVD-safe), 24-occasion cap; `item-display.ts` reuses
scoring's now-exported `itemNumeric` so colors can't disagree with scores;
reverse rows marked, raw value stays cell text): InstrumentCard grew a
`Tabelle | Items | Prozessprofil` toggle for the SECONDARY block only — the
TrajectoryChart stays always-mounted (visible-scale state + overlays). ④
**Caseload cockpit** (`Cockpit.tsx` + pure `analytics/cockpit.ts`): traffic
lights red(activeAlerts) > amber(NOT ∨ early_deterioration [triage policy]) >
green > grey, latest PHQ-4 + Δ, dropout mini-gauge, days-since-measurement,
overdue count — ALL client-side from the clinic payload + existing summaries
endpoint (NOT extended); replaces the In-Therapie PatientRow list for clinical
roles (admin keeps plain rows; assigned/unassigned sections unchanged). ⑤
**Outcomes dashboard** (`outcomes.ts`, director-only `/api/outcomes` off the
cached reference, full-window `OutcomesView`, AppShell view `outcomes`):
Jacobson-Truax (strict >, matching rci.ts; `PRIMARY_CLINICAL_CUTOFF = 2.5` =
PHQ-4 band boundary, NOT derived criterion c [clinician-confirm]; cutoff-null
collapses recovered→improved), pre/post scatter with numeric axes (required for
`ReferenceLine segment`), category bars, uncontrolled baseline-SD d (sign fixed
so + = improvement), termination mix/year, dose–response. `ReferenceCase` gained
`attendance` + `treatmentEndAt`. Sim: `with-logs` active (Karin Lang) has a
planted PSTB dip `pstbSessions` override (S2→S3 rupture, transient so NOT a
sudden loss; noise drawn unconditionally to keep the RNG stream stable). All
surfaces verified to degrade honestly after `sim:purge` (alliance silent,
outcomes = 4 real points, dropout unavailable). 156 tests.

**Batch 14 (2026-07-19)**: **DIPS un-gated from the demographics intake.** The
therapist can start the DIPS from the dossier for ANY non-archived patient
without one, from registration on (the `status === "assessment"` 409 in
`POST .../dips` is gone; Batch 9's "existing DIPS overrides the
assessment-stage gate" is superseded — the gate no longer exists). Completing
a DIPS at `"assessment"` advances the patient to `"interview"`; the diagnose
PATCH (`dips_required`, → therapy) is unchanged. The portal's demographics
to-do is keyed on the missing `patient.assessment` (= `assessmentDate`), NOT
on status, so it survives DIPS/diagnosis leapfrogging; the assessment route
only advances `assessment → interview` (never downgrades) and 400s on
archived. "Diagnostik öffnen" shows pre-DIPS on active dossiers (DiagnosisView
already handled the no-DIPS case; its start button now hides for archived).
**DIPS redo**: "DIPS wiederholen" GhostButton in DiagnosisView's interview-
record header → same `dips-interview` view with a replace-warning intro
(`dipsInterviewRedoIntro`); submit replaces via the existing intake_once
`deleteMany`. Seeds: p8 moved to `"interview"` (a DIPS at `"assessment"` is
now an impossible state), `seed-clinic` falls back to the DIPS date for
`assessmentDate` when a patient has demographics but no sessions (p6/p7 —
otherwise their portals would newly show the intake to-do). i18n:
`diagnosisAfterIntake` removed; `redoDips` + `dipsInterviewRedoIntro` added.
Same-day follow-up: **handwritten ink notes on DIPS free-text fields**
(`yesno_text` "Beschreiben" follow-ups + `textarea` items). Handwriting is
captured as strokes (pen/finger/mouse PointerEvents incl. pressure) and kept
AS WRITTEN — never converted to text; tablet-OS handwriting-to-text (Scribble
/Windows Ink) still targets the text field itself, and both can coexist on
one field. `src/lib/ink.ts` (pure: `parseInk` validates every number so SVG
rendering can trust tampered rawAnswers; quadratic-midpoint `strokePath`;
`inkToSvg`+`toBase64` for FHIR) + `src/components/InkPad.tsx` (InkControl/
editor/InkPreview; strokes live in NOTE-space coordinates so a note re-renders
undistorted at any viewport width; canvas scales; `touch-action: none`;
`setPointerCapture` wrapped in try/catch). Storage: serialized JSON string
under sibling key `<textKey>_ink` in the ordinary answer map — NO schema/type
change (`ModuleAnswers` values are strings; `createResponse` stores rawAnswers
verbatim). Display: DipsSummary coded-responses toggle (same visibility as
typed text — notes on non-entered modules live only in rawAnswers/export);
FHIR `valueAttachment` `image/svg+xml` (interface gained the field). i18n:
`T.ink*` keys (interview-language dict, not UI dict). 12 tests in
`tests/ink.test.ts` (168 total).

**Batch 15 (2026-08-24)**: **audit fixes — DIPS procedure, psychometrics,
security.** DIPS: currency criterion per module (lifetime-only answers no
longer propose present-tense diagnoses; caveat instead), optional **clinician
severity rating 0–8** (`clinsev_sev` in every tail — DIPS convention; takes
precedence over patient impair/distress in the significance criterion AND in
`primaryProposal` ranking), **ICD-10 suppression** (panic met + agora met →
F40.01 only, panic eval `suppressed: true` + blue "In F40.01 enthalten" chip),
**child criteria** via `EvalContext{age}` (GAD ≥1 symptom <18; separation
anxiety ≥4 weeks via new item `4.1`, `4.2` now conditional on it), agora
"alonehome" moved to a `nonCore` grid group (not one of DSM-5's 5 categories),
agora crit C (item 4) + phobia immediacy (item 3) now required AND evaluated,
GAD symptoms with `_maj: "no"` excluded from the count (tail entry lowered to
≥1 symptom), screening follow-ups (agora/social 1.2–1.6, phobia 1.2/3, sep
1.3) are `req` — a positive screen can no longer submit as "nicht zutreffend",
panic tail entry widened to `panicTail` (attacks established, not PD-met) so
organic/substance exclusions are always asked, FHIR exports negative screens +
zero frequencies, DIPS `raterRole` corrected to `clinician`. Psychometrics:
BDI-FS bands corrected to published cut-offs (0-3/4-8/9-12/13-21) + prorated
(tolerance 1, round); SDQ subscales prorated per official rule (≥3 of 5,
mean×5 rounded — `prorated_sum` grew `missingTolerance`+`rounding`); FGG
GG_Mean requires ≥30/37; `populationMatches` parses numeric age ranges
(`src/lib/instruments/population.ts` — a 5-year-old no longer matches SDQ
11-17). Analytics: `classifyOnTrack` band streak measured from the TAIL (a
past dip no longer pins the amber banner), JT "recovered" requires
dysfunctional baseline, one-hot reference levels dropped (employment/category
"other"), dropout AUC labelled in-sample. Security: therapist reads are
caseload-scoped server-side (`src/lib/access.ts` `therapistScoped` — clinic
payload, GET patient, dips/export/import/invitations/documents), submissions
validated (`instruments/validate.ts` — unknown ids/out-of-range 400), patient
sessions can't set respondentRole/sessionNumber/wave, archived patients reject
responses, `contact` e-mail uniqueness-checked, `diagnose` requires text,
X-Forwarded-For read `TRUSTED_PROXY_COUNT` from the right, SESSION_SECRET
throws in production, session auto-numbering is patient-wide (same-day reuse,
else global max+1 — PSTB/PHQ-4 axes can't desync). 194 tests.

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
