# Trajectory-based outcome prediction (Lutz / patient-focused research) — summary and roadmap for Linden Clinic

Research date: 2026-07-03. This document summarizes the research program of
Wolfgang Lutz (University of Trier) and colleagues on predicting individual
psychotherapy outcomes from session-by-session trajectories, maps it onto this
codebase, and defines (a) what is implementable now, (b) what data the clinic
should start collecting today so the advanced stages become possible, and (c) how
the data model supports the downstream statistics.

---

## 1. The research program in seven ideas

### 1.1 Patient-focused research: "is THIS patient on track?"

Classical efficacy research asks whether a treatment works *on average*.
Patient-focused research (Howard, Moras, Brill, Martinovich & Lutz, 1996,
*American Psychologist*) asks whether the *individual* patient is progressing as
expected, **while treatment is still running** — so the answer can change the
treatment. Prerequisite: brief, validated measures administered at every session
(routine outcome monitoring, ROM). Clinical judgment alone demonstrably fails at
this task: therapists detect deterioration in their own patients at very low
rates, which is the core argument for measurement-based care.

### 1.2 Dose–response and log-linear change

Howard's dose–effect research established that improvement is typically
negatively accelerated: most change happens early (log-linear as a first
approximation), and the expected gain per additional session falls. Two practical
consequences: (i) *early* change carries most of the prognostic signal; (ii)
"more sessions" is not automatically the answer for a non-responding patient —
changing something about the treatment is.

### 1.3 Expected Treatment Response (ETR)

Lutz, Martinovich & Howard (1999, *J Consult Clin Psychol*) introduced the ETR
method: fit **multilevel growth-curve models** (patients = level 2, sessions =
level 1, typically log-linear time) on a large archive of completed treatments,
with intake characteristics as predictors of intercept and slope. For a new
patient, the model generates an *expected* session-by-session curve given their
intake profile. The strongest predictor is always **initial severity**; the
classic additional predictors are **chronicity of the problem, prior
psychotherapy, treatment expectations, functional impairment/well-being, and
social support**.

### 1.4 Failure boundaries and signal alarms

Finch, Lambert & Anderson (2001) put percentile **tolerance bands** around the
expected curve (e.g. the band containing 80% of comparable patients; boundaries
at 50/68/80/90/95% have all been used — Lutz et al. 2006, *Clin Psychol
Psychother*, "The probability of treatment success, failure and duration").
A patient who crosses the lower boundary is **not on track (NOT)**: a
signal-alarm is raised for the therapist. This is the mechanic behind Lambert's
OQ-45 feedback system and Lutz's German-language systems. The robust empirical
finding across feedback trials: **feedback changes outcomes mainly for NOT
patients** — deterioration rates drop when therapists are alerted and given
problem-solving support; for on-track patients feedback matters little.

### 1.5 Nearest-neighbor prediction

Lutz, Leach, Barkham, Lambert et al. (2005, *J Consult Clin Psychol*; 2006):
instead of one global regression, predict a patient's expected course from the
**k most similar previously treated patients** (similarity over intake
variables) — a strategy borrowed from avalanche forecasting. Advantages:
locally adaptive, naturally handles interactions, degrades gracefully into "we
have too few similar patients yet" — which is also the honest state of a young
dataset like this clinic's.

### 1.6 The Trier Treatment Navigator (TTN): the full system in production

Lutz et al. (2019, *Behaviour Research and Therapy*, "Towards integrating
personalized feedback research into clinical practice") describe the complete
decision-support system running in the Trier outpatient clinic:

- **Pre-treatment**: ML-based predictions from the intake battery — e.g.
  **dropout risk** and a recommendation between initial treatment strategies;
  nearest-neighbor expected-course generation.
- **During treatment**: a brief symptom measure (**HSCL-11**, a Hopkins Symptom
  Checklist short form) plus session/alliance ratings **every session**; a
  **dynamic failure boundary** recomputed as data accrues; NOT alarms.
- **On alarm**: therapists don't just get a red light — they get **Clinical
  Support Tools** for five problem areas: (1) risk/suicidality, (2)
  motivation/therapy goals, (3) therapeutic alliance, (4) social support /
  critical life events, (5) emotion regulation. The prospective evaluation
  showed the dynamic boundary reliably identified patients at risk of
  non-improvement/deterioration.

### 1.7 Early change, sudden gains and losses

The strongest *process* predictors of final outcome are patterns in the first
handful of sessions:

- **Early response / early non-response**: reliable improvement within roughly
  sessions 1–6 predicts good outcome; early deterioration predicts failure and
  dropout better than any intake variable.
- **Sudden gains** (Tang & DeRubeis, 1999): a between-session improvement that is
  (i) large in absolute terms (originally ≥7 BDI points; modern practice uses an
  **RCI-based cutoff** so it generalizes across instruments), (ii) ≥25% of the
  pre-gain score, and (iii) stable (mean of the 3 sessions before vs. after
  differs significantly). Sudden **losses** are the mirror image. Sudden gains
  predict better end-of-treatment scores; Lutz, Rubel and colleagues replicated
  these patterns in large naturalistic samples and tied early trajectories to
  dropout risk.

The synthesis of the whole field is Lutz, Schwartz & Delgadillo (2022, *Annual
Review of Clinical Psychology*, "Measurement-Based and Data-Informed
Psychological Therapy"): measure briefly but every session → model expected
courses → raise signal alarms → give therapists actionable tools. Related
large-scale validation: dynamic (session-by-session updated) outcome prediction
in the IAPT system (Lancet Digital Health, 2021).

**Sources:**
[Nearest-neighbor prediction (Lutz et al. 2005)](https://pubmed.ncbi.nlm.nih.gov/16287390/) ·
[Probability of success/failure/duration (Lutz et al. 2006)](https://onlinelibrary.wiley.com/doi/abs/10.1002/cpp.496) ·
[TTN development paper (Lutz et al. 2019)](https://pubmed.ncbi.nlm.nih.gov/31301550/) ·
[TTN case study (Schaffrath et al. 2022)](https://onlinelibrary.wiley.com/doi/full/10.1002/jclp.23362) ·
[Annual Review 2022](https://www.annualreviews.org/content/journals/10.1146/annurev-clinpsy-071720-014821) ·
[Dynamic prediction, Lancet Digit Health 2021](https://www.thelancet.com/journals/landig/article/PIIS2589-7500(21)00018-2/fulltext) ·
[suddengains R package](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7062272/) ·
[Expected recovery curves / early warning (Lutz et al.)](https://www.researchgate.net/publication/227786417_Psychotherapy_Quality_Control_The_Statistical_Generation_of_Expected_Recovery_Curves_for_Integration_into_an_Early_Warning_System)

---

## 2. What this tool already has, in Lutz's terms

| TTN ingredient | Linden Clinic status |
| --- | --- |
| Session-wise measurement infrastructure | ✅ `every_session` cadence, in-app + LimeSurvey + CSV ingestion, auto session numbering |
| Session-wise **process/alliance** measure | ✅ PSTB (8 scales incl. Therapiebeziehung — the alliance signal TTN also tracks) |
| Session-wise **symptom** measure | ✅ **PHQ-4 (added 2026-07-03, this batch)** — the equivalent of TTN's HSCL-11 slot |
| Long-format scored storage for growth modeling | ✅ `ResponseInstance` × `ScaleScore` (see §5) |
| Reliable-change logic | ✅ `src/lib/instruments/rci.ts` (placeholder psychometrics, flagged) |
| Safety alarms | ✅ data-driven `alert` rule (BDI-FS suicide item) with banner propagation |
| Expected-course bands / NOT alarms | ❌ Stage 1 roadmap (below) |
| Sudden-gain / early-change detection | ❌ Stage 1 roadmap |
| Intake predictors, dropout labels | ❌ data checklist (§4) — start collecting now |
| ETR / nearest-neighbor / dropout ML | ❌ Stages 2–3 — blocked on sample size, not on code |

---

## 3. Staged roadmap

### Stage 1 — implementable now, no reference sample needed

1. **Sudden gain/loss markers** (`detectSuddenShifts` over any scored series):
   RCI-adapted Tang & DeRubeis criteria — |Δ| ≥ RCI threshold, Δ ≥ 25% of the
   pre-shift score, pre/post-3-session stability. Rendered as diamonds on
   `TrajectoryChart` (the RCI triangle markers in `src/components/charts.tsx`
   show where to hook in).
2. **Early-change classifier**: baseline → session ≤4 change vs. the RCI
   threshold → "early response / early deterioration / indeterminate" badge in
   `SummaryStrip` and the director's scores matrix.
3. **Empirical expected-course band from the clinic's own cases**: per
   (instrument, scale, occasion) percentiles {p25, p50, p75} pooled from all
   other patients (alignment logic already exists in `occasionOf`); drawn as a
   shaded band behind the patient's line **with the n displayed** ("reference:
   n=12 clinic cases — not a validated ETR"). No fabricated norms; below n≈3 the
   band stays hidden.
4. **Amber "not on track" flag**: below the p25 boundary (direction-aware via
   `higherIsBetter`) for ≥2 consecutive occasions, or RCI deterioration vs.
   baseline → joins the existing alert-banner mechanics (`activeAlerts`,
   `src/lib/types.ts`) as a distinct amber signal; red stays reserved for safety.
5. **Pseudonymized long-format CSV export** (director-only, network-gated) — the
   handover point to R/lme4/brms and colleagues doing the statistics (§5).

### Stage 2 — once ~30–50 completed treatments are stored

- Clinic-specific expected-course curves **stratified by initial severity**
  (the single most important ETR predictor) — still plain empirical percentiles,
  now per severity tertile.
- First dropout/duration analyses (needs the termination labels from §4).
- Replace placeholder RCI psychometrics with values from the manuals; recompute
  markers retroactively (raw answers are stored, so everything is re-scorable).

### Stage 3 — hundreds of cases / multi-site / research cooperation

- Multilevel ETR (log-linear growth curves with intake predictors) and/or
  **nearest-neighbor** expected courses; dynamic failure boundaries updated
  session-by-session.
- Pre-treatment **dropout-risk** and strategy-recommendation models (the TTN
  blueprint). At this point a cooperation with an academic group (e.g. exactly
  the Trier/Lutz ecosystem) becomes realistic because the export format (§5)
  is already the shape such projects consume.

### Explicitly out of scope until the clinic decides

- Clinical Support Tools content (the TTN's problem-solving modules are
  copyrighted clinical material); the *slot* for them is the alert banner.
- Any prediction shown to patients. Predictions are therapist-facing decision
  support, never patient-facing (consistent with how TTN deploys them).

---

## 4. Data the clinic should start collecting NOW

The models of Stages 2–3 are only as good as the labels and predictors collected
from day one. Checklist, each with its intended storage location:

1. **Session-wise symptom measure** — ✅ done this batch: PHQ-4 after every
   session alongside the PSTB (4 items, ~20 seconds, public domain, German
   validated version; Löwe et al. 2010). The legacy clinic used PHQ-4 only
   inside the wave-based batteries; the session-wise cadence is a deliberate new
   decision to enable symptom trajectories.
2. **Treatment episode labels** (the ML target): treatment start/end dates and a
   coded **termination reason** (`completed | dropout | mutual | transfer |
   other`) → future `Patient.treatmentStartAt/treatmentEndAt/terminationReason`
   columns + a small "close treatment" control. Without a dropout label there is
   no dropout prediction.
3. **Structured intake predictors** (the classic ETR set): problem duration/
   chronicity, prior psychotherapy (y/n), psychotropic medication (y/n),
   employment status, treatment expectation (0–10) → future
   `Patient.caseCharacteristics` JSON, entered on the diagnosis card — coded
   fields, never free text.
4. **Research pseudonym**: `Patient.code` following the legacy `A00120`-style
   convention, auto-generated, used in every export instead of names.
5. **Session attendance log**: sessions that happened *without* a questionnaire
   (cancellations, no-shows) — needed for true dose–response and dropout timing.
   Lightweight future `SessionLog` table or a "session without questionnaire"
   quick action.
6. **Per-occasion therapist attribution** — ✅ already collected
   (`ResponseInstance.conductedById`), enables therapist-effect modeling.
7. **ICD-coded diagnosis** next to the coarse `disorderCategory` — categories
   are good for filtering, codes are what prediction papers stratify on.

The single most important cultural point from the feedback literature: the value
comes from **completeness of measurement** (every patient, every session, also —
especially — when things go badly), not from occasional deep assessment.

---

## 5. Storage: why the current model fits the statistics, and the export contract

The analysis-side consumers (R: `lme4`, `brms`, `suddengains`; SPSS legacy) want
**tidy long format**: one row per patient × occasion × scale. That is exactly the
`ScaleScore` table joined up:

```
patient(code) ── ResponseInstance(occasion) ── ScaleScore(value) ── Scale(key) ── Instrument(id)
```

Design decisions already in place that matter for downstream work:

- **Raw answers and derived scores are both stored** (`rawAnswers` JSON on the
  response, `ScaleScore` rows per scale). Formulas are data (`Scale.formula`),
  interpreted by one engine — so historical data can always be **re-scored** when
  a formula or RCI parameter is corrected, and item-level analyses stay possible.
- **Occasion semantics are explicit**: `sessionNumber` (0 = baseline) for
  session-wise instruments, `wave` (pre/zm/post/postF) for batteries,
  `occurredAt` always — the three time axes growth models need (session index,
  phase, calendar time).
- **Rater is first-class** (`respondentRole`) — multi-informant models (SDQ
  self vs. mother) need it as a column, not a naming convention.
- **Provenance** (`source`: in_app/limesurvey/csv_import/manual_entry) and
  **verification status** (`Instrument.definitionStatus`, `rangeAssumed`,
  placeholder-flagged RCI values) are stored, so analyses can exclude
  unverified material instead of silently trusting it.
- **Unscoreable ≠ lost**: partial-definition instruments still store raw
  responses; scores appear when the definition is completed.

**Export contract (Stage 1 item 5).** One flat CSV, pseudonymized, director-only:

```
patient_code, disorder_category, age, sex, therapist_pseudonym,
treatment_start, treatment_end, termination_reason,
instrument, scale_key, value,
session_number, wave, measurement_index, occurred_at,
respondent_role, source, conducted_by_pseudonym, response_status
```

plus an optional item-level file (one row per response × item) for item analyses.
Rule: **exports are flat files derived from the operational DB, never the DB
itself**; no names/e-mails ever leave the system. When the dataset outgrows
SQLite, the documented one-line Postgres switch applies with no schema change.

---

## 6. Open questions for the clinic

1. May the PHQ-4 be added to the standard post-session routine clinic-wide
   (patient burden: 4 items)? (Implemented as such in the prototype.)
2. Who owns the definition of "dropout" for the termination-reason coding —
   unilateral termination before session X? Therapist judgment?
3. Are the classic ETR intake predictors (chronicity, prior treatment,
   expectations, employment) acceptable additions to the intake interview?
4. For Stage 3, is a research cooperation (data-sharing agreement, ethics
   approval) an option? The export format is designed to make that cheap.
