# Linden Clinic

A therapy-progress platform prototype built around a **generic instrument
engine**: every clinical questionnaire (its items, scales, scoring formulas,
rater, administration cadence) is *data* in the database, not code. Patients
fill out questionnaires (in-app, via LimeSurvey, or on paper entered by the
clinic), the system scores them with a shared scoring engine, and therapists /
the clinic director see each patient's scale scores plotted over time
("trajectories") per instrument — the digital replacement for the legacy
SPSS-plus-R reporting pipeline described in `docs/legacy-system-reference.md`.

> **Prototype, not a production health system.** Authentication is mocked, and
> there is no encryption-at-rest, audit logging, or access-control hardening.
> Before handling real patient data you must add real auth, encrypt PHI, add
> audit trails, and review against GDPR / the Swiss revDSG. See
> [Security & compliance](#security--compliance).

## Stack

- **Next.js 14** (App Router) + **TypeScript** — frontend and API in one repo
- **Prisma** ORM with **SQLite** for zero-config local dev (one-line switch to Postgres)
- **recharts** for the trajectory charts
- **Tailwind CSS** for styling

## Quick start

Requires Node 20+.

```bash
npm install                 # installs deps; postinstall runs `prisma generate`
cp .env.example .env        # default DATABASE_URL points at a local SQLite file
npm run db:push             # create the database from the Prisma schema
npm run db:seed             # instrument catalog + fictional demo patients
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000 and sign in with e-mail + password (all seeded
demo accounts, also listed behind "Show demo accounts" on the login page):

| Role | E-mail | Password |
| --- | --- | --- |
| Clinic director | `margrit.steiner@linden-clinic.ch` | `director2026` |
| Administrator | `kurt.iseli@linden-clinic.ch` | `admin2026` |
| Therapists | `anna.keller@` / `lukas.brunner@` / `sofia.ricci@linden-clinic.ch` | `therapist2026` |
| Patients (all 8) | e.g. `mara.vogel@example.org`, `tim.berger@example.org` | `patient2026` |

New patients can **self-register** from the login page (name, e-mail,
password, optional personal details) — they appear in the director's and
administrator's "new registrations — unassigned" list. The UI is available in
**German (default), French and English** (switcher on the login page and in
the header).

Demo data worth clicking: *Mara Vogel* (PSTB session trajectory, falling
BDI-FS with norm bands + RCI change markers, completed DIPS intake),
*Camille Perret* (EDE-Q8 pre/zm/post waves, worsening BDI-FS that trips the
**suicide-item safety flag**), *Tim Berger* (SDQ self- vs. mother-report,
DIKJ series), *Jonas Wyss* (FGG). Four archived patients (2024/2025, two
disorder categories) populate the **archive** — as the director you see all
four, as `anna.keller@` only her two.

## Authentication, roles & network restriction

- **Login** is e-mail + password for everyone (scrypt-hashed, HMAC-signed
  session cookie — `src/lib/password.ts`, `src/lib/auth.ts`). Patients
  self-register via the public `POST /api/register`.
- **Roles**: `patient` (own data only — the clinic API returns just their own
  record), `therapist` (their caseload), `director` (everything, incl. the
  clinic-wide questionnaire-scores matrix), `admin` (**assignment only**: sees
  patient lists, registration status and the disorder-category chip, can
  assign therapists — but never scores, trajectories, diagnoses or DIPS).
- **Archive**: the director or the assigned therapist can *conclude* a
  treatment ("Behandlung abschließen & archivieren", optionally recording the
  outcome — regular completion vs. dropout, the treatment-end label from
  `docs/outcome-prediction.md`). Archived patients disappear from the active
  overviews and move to the archive view (link at the bottom of the
  dashboard), a disorder-category ▸ year tree; the director sees all archived
  patients, therapists only their own, admin none. On archiving, the dossier
  is also exported to the server's filesystem under
  `ARCHIVE_DIR/<category>/<year>/<patient>/` as `patient.json` plus one
  trajectory CSV per instrument (best-effort; failures are surfaced in the UI
  but don't block archiving). Reopening restores the patient and leaves the
  exported files in place.
- **Network restriction** (`src/lib/network.ts`): when
  `ALLOWED_NETWORK_CIDRS` is set, staff sessions can only read/write clinic
  data from those IPv4 ranges (university network / VPN placeholder). Patients
  can register, log in and submit their own questionnaires from anywhere;
  `/api/limesurvey/notify` stays reachable for LimeSurvey callbacks. Note:
  the check trusts `x-forwarded-for`, so in production the app must run behind
  a trusted reverse proxy that overwrites that header.
- The every-session measures are the real **Berner Patientenstundenbogen
  (PSTB)** — 22 German items on a −3…+3 scale (wording supplied by the
  clinic), scored into its 8 published scales — and the **PHQ-4** (4 items,
  public domain), which adds the session-wise *symptom* trajectory needed for
  trajectory-based outcome prediction (see
  `docs/outcome-prediction.md` — Lutz-style expected treatment response,
  not-on-track signals, and the staged analytics roadmap). Validated German
  item text is shown regardless of UI language.

## The data model

Four tables replace the old hard-coded `WellbeingEntry` / `DipsSubmission`
shapes (see `docs/target-data-model.md` for the full rationale):

| Model | Meaning |
| --- | --- |
| `Instrument` | One questionnaire definition: items (`itemSchema` JSON), rater, population, cadence (`every_session` / `wave` / `periodic` / `intake_once`), `definitionStatus` |
| `Scale` | One computed sub-score: a `formula` (sum / mean / prorated_sum / custom expression), optional norm bands and score range |
| `ResponseInstance` | One filled-out questionnaire: patient × instrument × occasion × rater, raw answers as JSON |
| `ScaleScore` | Denormalized computed score per (response, scale) — what charts query |
| `QuestionnaireInvitation` | A tracked LimeSurvey link (token, status, reminders, import result) |

`docs/instrument-catalog.json` seeds 17 real instruments from the legacy
clinic analysis plus two clinic-internal ones (the wellbeing check-in and the
DIPS anxiety intake). Entries whose scoring could not be fully verified are
seeded with `definitionStatus: "partial" / "not_extracted"` — they are visible
in the app but **not scored** until their definition is completed from the
instrument manual; the UI says so explicitly. Item *wording* of licensed
instruments (BDI, Conners, CBCL, DIKJ, …) is deliberately not stored — only
item codes and scoring structure.

The scoring engine (`src/lib/instruments/scoring.ts`) interprets scale
formulas — reverse-scoring, missing-answer tolerance, prorated sums (DIKJ),
and a small sandboxed expression language for the non-linear cases (FGG's
ambivalence indices, SDQ total) — never `eval`.

## Getting questionnaire data in

Three paths, all ending in the same scored `ResponseInstance`:

1. **In-app** — patients fill out instruments whose full wording is stored
   (the session check-in); therapists can type in paper forms ("manual entry")
   for any verified instrument.
2. **LimeSurvey, automated** — set `LIMESURVEY_URL` / `LIMESURVEY_USERNAME` /
   `LIMESURVEY_PASSWORD` and therapists can send personal survey links and
   reminders from a patient's page; completed responses are pulled back and
   scored automatically (end-URL/webhook ping + "Sync now" poll).
   Setup conventions and API details: **`docs/limesurvey-integration.md`**.
3. **LimeSurvey, manual** — export responses as CSV (question codes as
   headers) and upload them on the patient's page.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run start` | Run the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run test` | Analytics unit + simulation sanity tests (node:test via tsx) |
| `npm run db:push` | Apply the Prisma schema to the database |
| `npm run db:seed` | Seed instrument catalog + demo data + simulated cohort |
| `npm run db:reset` | Wipe + reseed (≈15 s including the simulated cohort) |
| `npm run db:studio` | Prisma Studio (browse the DB) |
| `npm run sim:purge` | Delete all simulated patients (the real-data cutover) |

The seed includes a **simulated reference cohort** for the Lutz-style outcome
prediction (250 archived synthetic treatments + 10 active demo patients, all
marked with a SIM chip — see `docs/outcome-prediction.md`). Set
`SIM_COHORT_SIZE=0 npm run db:reset` to seed without it, or any other number
to change its size.

### Switching git branches

The SQLite database (`prisma/dev.db`) and the `archive/` folder are **not**
tracked by git, so they do not change when you switch branches. Because
branches can differ in their Prisma schema, run `npm run db:reset` once after
every `git switch <branch>` — it rebuilds the database for the code you just
checked out (all demo data is regenerated, nothing needs to be kept).

## Project structure

```
docs/
  legacy-system-reference.md   # how the real clinic stores this data today
  target-data-model.md         # the generalization this codebase implements
  instrument-catalog.json      # machine-readable instrument definitions (seed data)
  limesurvey-integration.md    # LimeSurvey research + setup conventions
  pipeline-coverage.md         # legacy .sps/.R script coverage cross-reference
  outcome-prediction.md        # Lutz-style trajectory prediction: research + roadmap
prisma/
  schema.prisma          # User, Patient, Instrument, Scale, ResponseInstance,
                         # ScaleScore, QuestionnaireInvitation
  seed.ts                # thin wrapper around src/lib/seed-clinic.ts
src/
  app/
    layout.tsx, page.tsx, globals.css
    api/                 # route handlers (the backend)
      auth/ clinic/ instruments/ patients/ invitations/ limesurvey/ seed/
  components/            # React UI (client components)
    AppShell.tsx         # session + data fetching + view routing
    InstrumentForm.tsx   # generic form renderer (any likert_battery instrument)
    charts.tsx           # TrajectoryChart / ScoreTable / GlobalChart
    Login, Dashboard, PatientDetail, PatientHome,
    AssessmentForm, DipsRenderer, DipsSummary, ui
  lib/
    instruments/         # the engine: types, catalog loader, scoring
    dips/                # structured-interview engine: types, schema, engine, FHIR
    limesurvey.ts        # RemoteControl 2 JSON-RPC client
    server-instruments.ts server-invitations.ts server-dips.ts  # server helpers
    i18n.ts theme.ts format.ts types.ts serialize.ts
    demo.ts seed-clinic.ts          # demo data
    db.ts auth.ts api-client.ts
```

The DIPS structured interview keeps its dedicated engine (`src/lib/dips/`) and
renderer — branching interviews don't fit the generic Likert renderer — but its
completed submissions are stored as `ResponseInstance` rows like everything
else (FHIR payload in `meta`).

## API

All endpoints require a session cookie except `POST /api/auth`,
`/api/limesurvey/notify` and (in dev) `POST /api/seed`.

| Method & path | Purpose |
| --- | --- |
| `GET /api/auth` | Current session |
| `POST /api/auth` | Login `{ email, password }` |
| `DELETE /api/auth` | Logout |
| `POST /api/register` | Public patient self-registration |
| `GET /api/clinic` | Full clinic data (patients + therapists + instruments) |
| `GET /api/instruments` | Instrument definitions |
| `PATCH /api/instruments/:id` | Link an instrument to a LimeSurvey survey |
| `POST /api/patients` | Register a patient manually (director/admin; optional e-mail + demographics) |
| `GET /api/patients/:id` | One patient (responses, scores, invitations) |
| `PATCH /api/patients/:id` | `{ action: "assign" \| "diagnose" \| "contact" \| "archive" \| "unarchive", … }` |
| `POST /api/patients/:id/assessment` | Submit DIPS intake → FHIR → ResponseInstance |
| `PUT /api/patients/:id/assessment` | Resend stored FHIR to the relay |
| `POST /api/patients/:id/responses` | Submit one questionnaire (scored server-side) |
| `POST /api/patients/:id/import` | Upload a LimeSurvey CSV export for this patient |
| `POST /api/patients/:id/invitations` | Create + send a LimeSurvey invitation |
| `PATCH /api/invitations/:id` | `{ action: "remind" }` |
| `POST /api/limesurvey/sync` | Poll LimeSurvey for completed responses |
| `GET/POST /api/limesurvey/notify` | Completion ping (survey end-URL / webhook) |
| `POST /api/seed` | Wipe + reseed (disabled in production) |

## FHIR persistence & relay

On intake submission the answers are serialized to a FHIR
`QuestionnaireResponse` and stored in the DIPS response's `meta`. If
`FHIR_RELAY_URL` is set, it is also POSTed there as `application/fhir+json`;
failures are stored and can be resent from the clinician view.

## Switching to Postgres

1. In `prisma/schema.prisma`, change the datasource provider to `"postgresql"`.
2. Set `DATABASE_URL` to your Postgres connection string in `.env`.
3. `npm run db:push && npm run db:seed`.

JSON payloads are stored as `String` (TEXT) columns and parsed in code, so the
schema is identical across SQLite and Postgres — no other changes needed.

## Docker

```bash
docker compose up --build
# then, once, load demo data:
docker compose exec app npm run db:seed
```

## Environment variables

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection (SQLite file by default) |
| `FHIR_RELAY_URL` | Optional external FHIR server to forward intake submissions to |
| `LIMESURVEY_URL` | Base URL of the LimeSurvey installation (optional) |
| `LIMESURVEY_USERNAME` / `LIMESURVEY_PASSWORD` | RemoteControl API credentials |
| `ARCHIVE_DIR` | Folder for the filesystem export of archived patients (default `./archive`) |
| `ALLOWED_NETWORK_CIDRS` | Staff data access restricted to these IPv4 CIDRs (blank = unrestricted) |
| `COOKIE_SECURE` | `"true"` to mark the session cookie Secure (HTTPS only) |
| `SESSION_SECRET` | Signs the session cookie — set a strong value in any deployment |

## Security & compliance

This scaffold is intentionally minimal. Before any real-world use:

- **Harden auth further.** Passwords are scrypt-hashed and sessions are
  HMAC-signed with expiry, but there is no session store/revocation, rate
  limiting, e-mail verification or password reset. For production, prefer a
  real identity provider (e.g. Auth.js / OIDC) and set a strong `SESSION_SECRET`.
- **Encrypt PHI at rest** and in transit; restrict and rotate database credentials.
- **Add audit logging** for every read/write of patient data.
- **Review data handling** against GDPR and the Swiss revDSG — including the
  LimeSurvey side: participant e-mails and raw answers live on the LimeSurvey
  server until pulled (processor agreement, EU/CH hosting, deletion routine).
- **License instrument content** before entering item wording: the catalog
  deliberately stores only item codes and scoring structure for copyrighted
  instruments (BDI, Conners, CBCL/YSR, DIKJ, …).
- The **French and English questionnaire text are working translations**, not the
  validated DIPS/ADIS language versions — replace before clinical use.

## Attribution

The intake content is adapted from **DIPS Open Access** (Margraf, Cwik,
von Brachel, Suppiger & Schneider, 2021) for demonstration. The adaptation is
patient self-report and is not a validated instrument.
