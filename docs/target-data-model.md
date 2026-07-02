# Target data model: generalizing Linden Clinic to a multi-instrument platform

Goal: replace today's two hard-coded, single-purpose data shapes (`WellbeingEntry`,
`DipsSubmission`) with a **generic instrument engine** that can represent every
questionnaire in `docs/legacy-system-reference.md` — and any future one — as data,
not as a new TypeScript module + Prisma migration each time. This is the same shift
the legacy clinic made implicitly by giving every instrument its own `.sav` + `.sps`
pair: the *instrument definition* (items, scales, scoring, cadence) should be a
first-class, inspectable record, separate from *responses* (one filled-out
questionnaire) and *scores* (the numbers derived from a response).

## What exists today (`linden-clinic` as of this commit)

Stack: Next.js 14 App Router + TypeScript, Prisma/SQLite, recharts, Tailwind. ~2,400
lines total — small and easy to refactor.

- `Patient` has exactly two hard-coded relations: `entries: WellbeingEntry[]` (a
  fixed 6-dimension post-session check-in: mood/calm/sleep/energy/social/coping,
  averaged into one 0-100 "wellbeing index") and `dips: DipsSubmission?` (a single
  one-off structured anxiety-intake interview, adapted from DIPS Open Access,
  serialized to FHIR).
- `src/lib/dips/` (types.ts, schema.ts, engine.ts, fhir.ts) is a genuinely reusable
  pattern worth keeping: `Item` (typed: yesno / grid / dual_scale / textarea / date /
  ...), grouped into `Section`s, grouped into `DipsModule`s, each with a `showIf`
  visibility predicate and an `enter` predicate for conditional branching. This is a
  solid template for **complex, branching structured interviews** (SCID-5-SPQ would
  fit this shape well) — but it's the wrong shape for the ~15 straightforward
  Likert-item scored questionnaires in the catalog (BDI-FS, SDQ, CBCL, Conners 3,
  DERS, etc.), which are homogeneous item batteries with a handful of summary
  formulas, not branching interviews.
- `src/lib/wellbeing.ts` hard-codes the one session check-in as `DIMS: Dim[]` with a
  fixed `composite()` formula. This is structurally exactly what PSTB/SBKJ is (an
  every-session self-report with several scales averaged from items) — but PSTB has
  8 clinically-named scales built from 22 items with reverse-scoring, not 6 generic
  wellbeing dims. **This is the piece most directly reusable as the template for a
  generic "instrument, administered every session" type.**
- `src/components/charts.tsx` (`GlobalChart`, `PatientChart`) already implements
  almost exactly what the legacy Word "Verlauf" reports do by hand: a
  toggleable-series line chart, x-axis = session/occasion, tooltip, baseline marker.
  **This component's shape generalizes directly to "chart any scale's score across a
  patient's response history" — it just needs to take a scale key instead of a
  hard-coded dimension.**
- Auth is mocked (unsigned cookie); fine for a prototype, flagged in the existing
  README as needing real auth before any real data touches it. Not addressed here.

## Proposed schema (Prisma, additive/replacing)

```prisma
/// A questionnaire definition: items, scales, scoring, rater, cadence.
/// One row per instrument, e.g. "bdi_fs", "sdq_self_11_17", "pstb_adult".
model Instrument {
  id            String   @id                 // stable slug, e.g. "bdi_fs"
  name          String                       // "Beck Depression Inventory – Fast Screen"
  abbreviation  String
  population    String                       // "adult" | "adolescent" | "child_2_4" | "child_4_17" | ...
  raterRole     String                       // "self" | "parent" | "teacher" | "caregiver" | "clinician"
  instrumentType String                      // "likert_battery" | "structured_interview"
  cadenceType   String                       // "every_session" | "wave" | "periodic" | "intake_once"
  cadenceConfig String   @default("{}")      // JSON, e.g. {"waves":["pre","zm","post","postF"]} or {"targetIntervalDays":90}
  itemSchema    String                       // JSON: [{ id, label, responseType, options, reverseScored }]
  scales        Scale[]
  responses     ResponseInstance[]
  createdAt     DateTime @default(now())
}

/// One computed sub-score for an instrument (e.g. BDI_FS_total, or PSTB's
/// Therapiebeziehung). formula is interpreted by the scoring engine, not by Prisma.
model Scale {
  id            String   @id @default(cuid())
  instrumentId  String
  instrument    Instrument @relation(fields: [instrumentId], references: [id], onDelete: Cascade)
  key           String                       // "BDI_FS_total"
  label         String
  formula       String                       // JSON: { type: "sum"|"mean"|"prorated_sum"|"custom", items: [...], missingTolerance?, expression? }
  normBands     String?                      // JSON: [{ min, max, label }]  — optional, for reference lines on charts
  scores        ScaleScore[]

  @@unique([instrumentId, key])
}

/// One filled-out questionnaire: a patient, an instrument, an occasion, a rater.
model ResponseInstance {
  id             String   @id @default(cuid())
  patientId      String
  patient        Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  instrumentId   String
  instrument     Instrument @relation(fields: [instrumentId], references: [id])
  respondentRole String                       // "self" | "mother" | "father" | "teacher" | ...
  sessionNumber  Int?                         // set when instrument.cadenceType == "every_session"
  wave           String?                      // "pre" | "zm" | "post" | "postF", when cadenceType == "wave"
  occurredAt     DateTime
  rawAnswers     String                       // JSON: { itemId: value }
  status         String   @default("complete") // "complete" | "partial"
  scaleScores    ScaleScore[]
  createdAt      DateTime @default(now())

  @@index([patientId, instrumentId])
}

/// Denormalized computed score per (response, scale) — this is what trajectory
/// charts and tables query directly, so they never have to re-run the formula.
model ScaleScore {
  id                 String   @id @default(cuid())
  responseInstanceId String
  responseInstance   ResponseInstance @relation(fields: [responseInstanceId], references: [id], onDelete: Cascade)
  scaleId            String
  scale              Scale    @relation(fields: [scaleId], references: [id])
  value              Float

  @@unique([responseInstanceId, scaleId])
}
```

`Patient` keeps its existing fields (`demographics`, `status`, `therapistId`, ...)
and gains `responses: ResponseInstance[]` instead of the two hard-coded relations.
`WellbeingEntry` and `DipsSubmission` become **seed data for `Instrument`**, not
schema: PSTB/SBKJ becomes an `every_session` `likert_battery` instrument (this
replaces `WellbeingEntry` — same shape, real clinical scales instead of generic
wellbeing dims); the DIPS anxiety intake becomes an `intake_once`
`structured_interview` instrument, keeping the existing `src/lib/dips/` engine as its
renderer, with a thin adapter that writes into `ResponseInstance.rawAnswers` /
`ScaleScore` instead of the bespoke `DipsSubmission` table. FHIR export, if kept,
becomes an instrument-specific exporter rather than a schema concept.

## Scoring engine

A single function, `computeScaleScores(instrument: Instrument, rawAnswers): {key,
value}[]`, interprets each `Scale.formula`:
- `sum` / `mean` over a fixed item list, with an optional `missingTolerance`
  (BDI-FS: sum, tolerate ≤1 missing).
- `prorated_sum` (DIKJ: `sum / (n_items - n_missing) * n_items`, truncated).
- `custom` with a small, sandboxed expression form for the handful of non-linear
  cases (FGG's IWD: `mean of (a*b)/(abs(a-b)+1)` over 4 item pairs) — do **not**
  eval arbitrary JS; define a tiny formula DSL (or a fixed enum of named formula
  functions) so `Instrument`/`Scale` rows stay pure data and auditable.
- Reverse-scoring is a per-item flag in `itemSchema` (`reverseScored: true` +
  `scaleMax`), applied before the scale formula runs, not baked into the formula.

This single engine replaces the bespoke `composite()` in `wellbeing.ts` and would
also replace the per-questionnaire `.sps` files from the legacy system — each
`Instrument`/`Scale` pair is the digital equivalent of one legacy `.sav`+`.sps` pair.

## UI implications

- **Form rendering**: `likert_battery` instruments render generically from
  `itemSchema` (label + response scale) — one shared component instead of a bespoke
  form per instrument (`AssessmentForm.tsx`/`WellbeingForm.tsx` collapse into one
  generic renderer + the existing `DipsRenderer.tsx` for the one structured-interview
  type).
- **Trajectory charts**: generalize `charts.tsx` to take `(patientId, instrumentId,
  scaleKey[])` and query `ScaleScore` ordered by `occurredAt`/`sessionNumber` —
  same toggleable-series line chart, same tooltip, now driven by real data instead of
  the hard-coded `DIMS` array. `normBands` on `Scale` can render as reference
  bands/lines (the legacy Word reports print norm ranges as text next to each chart —
  this is the digital equivalent).
- **Per-patient overview**: instead of one hard-coded wellbeing chart + one DIPS
  summary card, iterate `patient.responses` grouped by `instrumentId` and render one
  card/chart per instrument that has ≥1 response, plus a "not yet administered" state
  for instruments expected but missing (useful for `wave`-based batteries: show
  which of pre/zm/post/postF are done).
- **Scheduling/reminders** (stretch): `cadenceType` + `cadenceConfig` is enough to
  compute "this instrument is due" (every_session → due at next logged session;
  wave → due when patient status changes; periodic → due after
  `targetIntervalDays`) — the legacy system has no such reminders (administration
  was manual/clinician-driven), so this would be a genuine improvement, not a port.

## Suggested build order

1. Add the four new Prisma models above; keep `WellbeingEntry`/`DipsSubmission`
   temporarily or migrate them in the same pass (small dataset, no real users yet —
   a hard cutover is reasonable).
2. Write `docs/instrument-catalog.json` (already drafted, see that file) as seed
   data for `Instrument`/`Scale` — start with PSTB/SBKJ (replaces WellbeingEntry
   1:1) and BDI-FS (simplest real instrument: 7 items, one sum formula) to validate
   the engine end-to-end before adding the rest.
3. Build `computeScaleScores()` and the generic `likert_battery` form renderer.
4. Generalize `charts.tsx` to the `(instrumentId, scaleKey)` shape; update
   `PatientDetail.tsx`/`Dashboard.tsx` to render per-instrument.
5. Migrate DIPS into the same `ResponseInstance`/`ScaleScore` storage (keep its
   existing renderer/FHIR code, just change where it persists).
6. Add remaining instruments from the catalog incrementally — no further schema
   changes should be needed, only new seed rows.
7. (Stretch) cadence-based "due" indicators on the dashboard.

## Explicitly out of scope for now

- Re-implementing SPSS/R-equivalent statistical output (the legacy Word/Excel
  reports) — the in-app trajectory chart is the intended replacement, not a
  document-generation feature, unless you want PDF/CSV export later.
- Real auth, encryption-at-rest, audit logging — already flagged in the existing
  README as pre-requisites for real patient data; unchanged by this proposal.
- Resolving the `[UNCONFIRMED]` items in `legacy-system-reference.md` (WBQ/TAIK
  sourcing, exact periodic-instrument cadence, patient-code scheme) — these are
  clinic knowledge, not something to infer from the repo.
