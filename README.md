# Linden Clinic

A therapy-progress platform prototype. Patients complete a structured anxiety
intake (a digitalised, **patient self-report** adaptation of the DIPS Open Access
"Angststörungen" section, in German / French / English) and post-session
wellbeing check-ins; therapists and the clinic director get dashboards and
per-patient detail. Completed intakes are serialized to a **FHIR R4
QuestionnaireResponse**, stored in the database, and optionally relayed to an
external FHIR server.

> **Prototype, not a production health system.** Authentication is mocked, and
> there is no encryption-at-rest, audit logging, or access-control hardening.
> Before handling real patient data you must add real auth, encrypt PHI, add
> audit trails, and review against GDPR / the Swiss revDSG. See
> [Security & compliance](#security--compliance).

## Stack

- **Next.js 14** (App Router) + **TypeScript** — frontend and API in one repo
- **Prisma** ORM with **SQLite** for zero-config local dev (one-line switch to Postgres)
- **recharts** for the wellbeing charts
- **Tailwind CSS** for styling

## Quick start

Requires Node 20+.

```bash
npm install                 # installs deps; postinstall runs `prisma generate`
cp .env.example .env        # default DATABASE_URL points at a local SQLite file
npm run db:push             # create the database from the Prisma schema
npm run db:seed             # load fictional demo data (patients, therapists, a sample DIPS)
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000 and pick a role to sign in (mock):

- **Patient** — e.g. *Nina Graf* (new → intake) or *Mara Vogel* (in therapy → check-ins)
- **Therapist** — e.g. *Dr. Anna Keller* (sees their caseload)
- **Clinic director** — *Dr. Margrit Steiner* (all patients, assignment, registration)

*Mara Vogel* has a completed sample intake, so the clinician DIPS summary and the
"View submitted data (FHIR)" payload are populated immediately.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run start` | Run the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run db:push` | Apply the Prisma schema to the database |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Wipe + reseed |
| `npm run db:studio` | Prisma Studio (browse the DB) |

## Project structure

```
prisma/
  schema.prisma          # User, Patient, WellbeingEntry, DipsSubmission
  seed.ts                # thin wrapper around src/lib/seed-clinic.ts
src/
  app/
    layout.tsx, page.tsx, globals.css
    api/                 # route handlers (the backend)
      auth/ clinic/ patients/ patients/[id]/ .../assessment .../wellbeing seed/
  components/            # React UI (client components)
    AppShell.tsx         # session + data fetching + view routing
    Login, Dashboard, PatientDetail, PatientHome,
    AssessmentForm, DipsRenderer, DipsSummary, WellbeingForm, ui, charts
  lib/
    dips/                # the instrument: types, schema (6 modules), engine, FHIR
    i18n.ts theme.ts wellbeing.ts format.ts types.ts
    demo.ts seed-clinic.ts          # demo data
    db.ts serialize.ts auth.ts server-dips.ts   # server helpers
    api-client.ts                   # typed fetch wrappers for the frontend
```

The DIPS instrument logic in `src/lib/dips/` is framework-agnostic and shared by
the client (rendering, validation) and the server (FHIR serialization, seeding).

## API

All endpoints require a session cookie except `POST /api/auth` and (in dev)
`POST /api/seed`.

| Method & path | Purpose |
| --- | --- |
| `GET /api/auth` | Current session |
| `POST /api/auth` | Mock login `{ role, id }` |
| `DELETE /api/auth` | Logout |
| `GET /api/clinic` | Full clinic data (patients + therapists) |
| `POST /api/patients` | Register a patient (director) |
| `GET /api/patients/:id` | One patient |
| `PATCH /api/patients/:id` | `{ action: "assign" \| "diagnose", … }` |
| `POST /api/patients/:id/assessment` | Submit intake → build + store FHIR, relay, advance status |
| `PUT /api/patients/:id/assessment` | Resend stored FHIR to the relay |
| `POST /api/patients/:id/wellbeing` | Add a wellbeing check-in |
| `POST /api/seed` | Wipe + reseed (disabled in production) |

## FHIR persistence & relay

On intake submission the answers are serialized to a FHIR `QuestionnaireResponse`
(one group per screened-positive module; `linkId`s built from module + item code;
typed `valueBoolean` / `valueInteger` / `valueString`; grid rows as nested items)
and stored on `DipsSubmission.fhir`. The clinic database is the system of record.

If `FHIR_RELAY_URL` is set, each QuestionnaireResponse is also POSTed there as
`application/fhir+json`. If the relay is unreachable the submission is still
stored and marked for resend (the **Resend** button in the clinician view, or
`PUT /api/patients/:id/assessment`). Leave `FHIR_RELAY_URL` blank to store locally only.

## Switching to Postgres

1. In `prisma/schema.prisma`, change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
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

The SQLite file is persisted in the `dbdata` volume. `docker-compose.yml` contains
a commented-out Postgres service for that path. When serving over HTTPS, set
`COOKIE_SECURE=true`.

## Environment variables

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection (SQLite file by default) |
| `FHIR_RELAY_URL` | Optional external FHIR server to forward submissions to |
| `COOKIE_SECURE` | `"true"` to mark the session cookie Secure (HTTPS only) |
| `SESSION_SECRET` | Reserved for real session signing (mock auth does not yet sign) |

## Security & compliance

This scaffold is intentionally minimal. Before any real-world use:

- **Replace mock auth.** `src/lib/auth.ts` stores an unsigned, base64 session
  cookie and the login route trusts the posted id. Swap in a real identity
  provider (e.g. Auth.js / OIDC), enforce per-row authorization, and sign/encrypt sessions.
- **Encrypt PHI at rest** and in transit; restrict and rotate database credentials.
- **Add audit logging** for every read/write of patient data.
- **Review data handling** against GDPR and the Swiss revDSG (data minimization,
  retention, subject-access, processing records).
- The **French and English questionnaire text are working translations**, not the
  validated DIPS/ADIS language versions — replace before clinical use.

## Attribution

The intake content is adapted from **DIPS Open Access** (Margraf, Cwik,
von Brachel, Suppiger & Schneider, 2021) for demonstration. The adaptation is
patient self-report and is not a validated instrument.
