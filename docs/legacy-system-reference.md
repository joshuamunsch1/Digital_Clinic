# Legacy system reference: the PTPS clinic database

This document is a factual record of how an existing (real, anonymized) outpatient
psychotherapy clinic currently stores and processes its questionnaire data. It is the
source material for `target-data-model.md`, which proposes how Linden Clinic should
generalize to cover the same ground. Treat this file as "what we observed", not as a
spec to copy verbatim — several details are flagged `[UNCONFIRMED]` and should be
validated with the clinic before being hard-coded.

The legacy system is **not a database in the SQL sense** — it's a folder of SPSS
data files plus an R pipeline that regenerates per-patient report files. Three
top-level folders, each one stage of a pipeline:

```
Daten_SPSS/                  <- raw scored data (the actual "database")
  <Instrument>/
    <Instrument>.sav         <- one row per patient per timepoint; items + computed scales
    Syntax_<Instrument>.sps  <- SPSS syntax: scoring formulas, recoding, reverse-items
Verlaufsmessung_R/            <- processing/reporting engine
  Auswertung_*.R              <- driver scripts: read .sav -> filter to patient(s) -> score -> plot -> write docx/xlsx
  Hilfsskripts/                <- shared helper scripts (some referenced but missing on disk, see "Gaps" below)
  Templates/                   <- Word templates with bookmark placeholders, filled via the R `officer` package
  Output_<Instrument>_{xlsx,docx}/  <- generated per-patient files (local copy)
Patienten_Auswertungsfiles/   <- clinician-facing deliverables (server copy of the same generated files)
  <Instrument>/<Code>_<Instrument>.xlsx    <- transposed table: rows = scales, columns = timepoints (M1, M2, ...)
  Verlaufsmessungen*/<Code>_..._Verlauf.docx <- one Word doc per patient: a line chart + norm legend per scale
  Paper-Pencil-Diagnostik/<Code>/           <- scanned/manual forms never digitized into the SPSS pipeline
```

## Core design patterns

- **Patient code** as the only identifier: a letter prefix + digits (e.g. `A00120`,
  `C00624`; a few `B...` and one `BEAT_...` code also appear — purpose unconfirmed
  `[UNCONFIRMED]`). Used consistently as the join key across every instrument file
  and every generated report.
- **Self- vs. informant-report** is a first-class distinction, not an afterthought:
  several instruments (Conners 3, SDQ, Pediatric Symptom Checklist) ship as parallel
  files/forms — one per rater (patient self-report, parent, teacher) — for the same
  underlying construct, at the same timepoint.
- **Three administration cadences**, mixed within the same clinic:
  1. **Every session** — PSTB / SBKJ (the session questionnaire you described).
  2. **Wave-based** — a `Typ` field with values `pre` / `zm` (Zwischenmessung,
     interim) / `post` / `postF` (post-treatment follow-up) marks big multi-instrument
     batteries administered at fixed points in the course of therapy, not every session.
  3. **Periodic / clinician-triggered** — screeners like BDI-FS, SDQ, Conners 3, DIKJ
     repeated an irregular number of times per patient, apparently at clinical
     discretion rather than a fixed schedule `[UNCONFIRMED — exact policy not
     documented in the data itself]`.
  4. **Intake-only** — SCID-5-SPQ, Somatik (SOMS-7T + TAS-20), SRS: essentially always
     one row per patient, used for diagnostic workup rather than progress tracking.
- **Scoring lives in the syntax file, not the raw data.** Every `.sav` stores raw
  item responses *and* the already-computed scale scores side by side — the `.sps`
  file is the authoritative, re-runnable definition of how one becomes the other
  (sums, means, reverse-coding, prorating for missing items, custom index formulas).
- **Output is always a transposed, per-patient time series**: one column per
  measurement occasion (`M1, M2, ... Mn`, or a real date), one row per scale — this
  is what both the xlsx exports and the Word "Verlauf" (course) charts are built from.
  This is the shape a trajectory view needs to reproduce.

## Instrument catalog

Item wording is intentionally omitted below (most of these are commercially
published, copyrighted instruments — Hogrefe/Pearson/WPS editions of BDI, Conners,
CBCL/YSR, IIP, DERS, BSI, SRS, etc.). What's captured is the **scoring structure**:
item counts, subscales, formulas, rater, population, and cadence — enough to build a
generic engine against, while the actual item banks would need to be licensed/entered
separately if this becomes more than a demo.

| Instrument | Full name / notes | Population | Rater(s) | Items | Scales (formula) | Cadence |
|---|---|---|---|---|---|---|
| **PSTB** | Berner Patienten-/Therapeutenstundenbogen 2000 (session process measure) | Adult | Self | 22 (4 reverse-scored) | 8 scales, each the mean of 1-4 items: Therapiebeziehung, Selbstwerterfahrungen, Bewaeltigungserfahrungen, Klaerungserfahrungen, Therapiefortschritte, Aufgehobensein, Direktivitaet_Kontrollerfahrungen, Problemaktualisierung | Every session |
| **SBKJ** | Kinderstundenbogen — child/adolescent analogue of PSTB | Child/adolescent | Self | 7 | Therapiebeziehung = mean(I1,I2); Therapiebezogene_Selbstwirksamkeit = mean(I3-I6); I7 tracked standalone | Every session |
| **BDI-FS** | Beck Depression Inventory – Fast Screen | Adult (also used pediatric/medical) | Self | 7 (0-3 each) | BDI_FS_total = sum, tolerate ≤1 missing. Norms: 0-3 minimal, 4-6 mild, 7-9 moderate, 10-21 severe. Item 7 (suicide) also flagged individually. | Repeated, no fixed interval found in data |
| **DIKJ** | Depressionsinventar für Kinder und Jugendliche, ages 8-16 | Child/adolescent | Self | 29 | Gesamtrohwert = prorated sum: `sum/(29-n_missing)*29`, truncated | Periodic |
| **Conners 3** | ADHD rating scale | Child/adolescent | Self (long+short), Parent, Teacher | ~60-280 depending on form | Inconsistency Index, PE/NE impression indices, Impairment ratings, Content scales (Unaufmerksamkeit, Hyperaktivität/Impulsivität, Lernprobleme, Aggressives Trotzverhalten/EF, Familiäre Beziehungen), Conners 3 Index, DSM-IV-TR scales, ICD-10 scales | Diagnostic workup + periodic monitoring |
| **CBCL** | Child Behavior Checklist (Achenbach) | Child (school-age, parent-rated) | Parent | ~120 | Activity/competence scales + 8 syndrome scales (AD, RD, KB, SP, DP, AP, RV, AV) aggregated into INT (internalizing), EXT (externalizing), GEMISCHT, TOT | Intake + periodic + wave-based (embedded in Standarddiagnostik) |
| **YSR** | Youth Self-Report (Achenbach), self-report analogue of CBCL | Adolescent | Self | ~120 | Same syndrome/aggregate structure as CBCL | Wave-based (embedded in adolescent Standarddiagnostik / Essstörungsdiagnostik) |
| **SDQ** | Strengths and Difficulties Questionnaire (Goodman) | Self (11-17), Parent (2-4, 4-17) | Self / Parent | 25 (5 reverse-scored: 7,11,14,21,25) | 5 subscales of 5 items each (EmoProbl, VerhProbl, Hyperak, VerhProblGleich, Prosoz) + GesProbl (Total Difficulties = sum of first 4, excludes Prosoz) | Screening; repeatable, cheap to re-administer |
| **Pediatric Symptom Checklist (clinic short form)** | 5-item ultra-brief version, **not** the standard PSC-17/PSC-35 | Child | Self / Parent | 5, categorical nie/manchmal/oft -> 0/1/2 | Gesamtscore = sum of 5 items | Screening |
| **SCID-5-SPQ** | Personality-disorder screening questionnaire preceding the SCID-5-PD structured interview | Adult | Self | 106 | No stored total — criterion-based scoring happens during the follow-up interview, not from this file | Once, at diagnostic workup |
| **Somatik** | SOMS-7T (somatoform symptom screening, 7-day) + TAS-20 (Toronto Alexithymia Scale) | Adult | Self | 132 + 20 | No computed totals in current data — raw items only `[UNCONFIRMED scoring]` | Intake diagnostics |
| **SRS** | Social Responsiveness Scale (autism-trait screener) | Child | Caregiver (Mutter/Vater) | ~65 | T-value subscales: Soziale Bewusstheit, Soziale Kognition, Soziale Kommunikation, Soziale Motivation, Autistische Manierismen | Rare in this dataset — handled on paper, not digitized |
| **FGG** | Fragebogen zu Gedanken und Gefühlen — Borderline-specific cognition screener | Adult/adolescent | Self | 37 (long form; 14-item short form also published) | GG_Mean (overall mean); IWD (contradictory-thinking index) = mean of 4 pairwise indices, each `(itemA*itemB)/(abs(itemA-itemB)+1)` | Screening / therapy planning, periodic |
| **EDE-Q8** | Eating Disorder Examination Questionnaire, 8-item short form | Adult/adolescent | Self | 8 | 4 subscales as pairwise item means (restraint, weight concern, shape concern, eating concern) + total = mean of the 4 | Wave-based / periodic, eating-disorder patients |
| **WBQ** | Binge-eating episode & compensatory-behavior frequency `[UNCONFIRMED published source]` | Adult/adolescent | Self | ~14 | Episode counts (WBQ4A/B/C) + max compensatory-behavior frequency (WBQ13) | Wave-based, eating-disorder patients |
| **DEBQ** | Dutch Eating Behaviour Questionnaire (emotional eating) | Adult/adolescent | Self | — | Embedded within Essstörungsdiagnostik battery | Wave-based |
| **BSI** | Brief Symptom Inventory | Adult | Self | ~53 | 9 subscales (Somatisierung, Zwang, SozUnsicherheit, Depressivität, Ängstlichkeit, Aggressivität, PhobischeAngst, Paranoid, Psychotizismus) + GSI/PST/PSDI global indices. **Note:** legacy syntax computes GSI as `SUM` in one file and `MEAN` in another — mean is correct per the BSI manual; flag as a bug to not replicate. | Wave-based (Standarddiagnostik/Essstörungsdiagnostik, adult) |
| **SIAS** | Social Interaction Anxiety Scale (6-item short form used here) | Adult/adolescent | Self | 6 | Total score | Wave-based |
| **PHQ-4** | Patient Health Questionnaire, ultra-short depression/anxiety screener | Adult/adolescent | Self | 4 | Total score | Wave-based |
| **IIP-64** | Inventory of Interpersonal Problems | Adult | Self | 64 | 8 octant scales (PA, BC, DE, FG, HI, JK, LM, NO) | Wave-based, adult |
| **DERS** | Difficulties in Emotion Regulation Scale | Adult | Self | — | 6 subscales (Nonacceptance, Goals, Impulse, Awareness, Strategies, Clarity) | Wave-based, adult |
| **FRKJ** | Fragebogen zu Ressourcen im Kindes- und Jugendalter (resilience/resources), ages 8-16 | Adolescent | Self | 60 | 10 subscales, 6 items each: Empathie, Selbstwirksamkeit, Selbstwertschätzung, Kohärenzsinn, Optimismus, Selbstkontrolle, elterliche Unterstützung, autoritative Erziehung, Peer-Integration, Schul-Integration + overall mean | Wave-based, adolescent |
| **FEEL-KJ** | Fragebogen zur Erhebung der Emotionsregulation bei Kindern und Jugendlichen, ages 10-19 | Adolescent | Self | — | Adaptive strategies (problem-solving, distraction, mood-enhancement, acceptance, forgetting, reappraisal, cognitive problem-solving) and maladaptive strategies (giving up, aggression, withdrawal, self-deprecation, perseveration), scored per emotion (anger/fear/sadness) | Wave-based, adolescent |
| **TAIK / TAIE** | Adolescent/parent-analogue of the Trierer Alkoholismusinventar `[UNCONFIRMED — adult TAI is a documented 90-item instrument; child/parent variants not independently verified]` | Adolescent / Parent | Self / Parent | 12 | TAIK_Total / TAIE_TOT | Wave-based |
| **IHS** | Locally labelled; subscales match Perceived Burdensomeness / Thwarted Belongingness — very likely the German-adapted Interpersonal Needs Questionnaire (INQ), tied to the interpersonal theory of suicide | Adult | Self | 15 | 2 subscales: Perceived Burdensomeness (6 items), Thwarted Belongingness (9 items) | Wave-based, adult |

**Composite batteries.** "Standarddiagnostik" and "Essstörungsdiagnostik" aren't
separate instruments — they're age-tiered bundles of the instruments above,
administered together at each `pre`/`zm`/`post`/`postF` wave:
- Adult: SES (sociodemographics) + BSI + BDI-FS + SIAS + PHQ-4 + IIP-64 + DERS +
  EDE-Q8 + IHS + (eating-disorder variant adds full EDE/DEBQ/WBQ instead of EDE-Q8 only)
- Adolescent: SES + YSR + BDI-FS + SIAS + TAIK + PHQ-4 + FRKJ + FEEL-KJ + EDE-Q8
- Early childhood (≤5y): SDQ (parent-report, 2-4 form) only
- School-age, parent-report: CBCL + TAIE

**Not part of the automated pipeline.** `Paper-Pencil-Diagnostik/` is a parallel
archive of scanned or manually-filled forms per patient code — CBCL, Conners 3, SDQ,
YSR, WURSK (Wender Utah Rating Scale, short form — retrospective adult ADHD
screener), AQ/EQ (Autism-Spectrum Quotient / Empathy Quotient). These never made it
into the `.sav`/R pipeline; they're either legacy records or instruments the clinic
hasn't digitized yet.

## Gaps and open questions (validate with the clinic before assuming)

1. **Patient code scheme.** `A`/`C` prefixes correlate with the age-group split seen
   across files (plausibly adult vs. child/adolescent); a few `B...` codes and one
   `BEAT_...` code don't fit that pattern and may indicate a separate cohort/study.
2. **WBQ and TAIK/TAIE** could not be traced to a specific published manual —
   possibly clinic-internal adaptations. Their item wording/scoring should be
   confirmed directly rather than assumed.
3. **Missing helper scripts.** `Hilfsskripts/PSTB_Daten_Hilfsskript.R` and
   `Plots_Hilfsskript.R` are `source()`-referenced by the R driver scripts but do not
   exist on disk — their logic only survives in `.Rhistory` transcripts and compiled
   `.RData` workspaces. The current legacy pipeline is **not fully reproducible from
   the files alone**.
3. **BSI_GSI formula inconsistency** — computed as `SUM` in the Standarddiagnostik
   syntax vs. `MEAN` (correct per manual) in the Essstörungsdiagnostik syntax.
4. **No scoring syntax exists** for `Somatik.sav` (SOMS-7T/TAS-20) or `SCID-5-SPQ.sav`
   — only raw items are stored; total/subscale formulas need to come from the
   published manuals, not from this codebase.
5. **Exact administration cadence** for the "periodic" instruments (BDI-FS, SDQ,
   Conners 3, DIKJ) is inferred from row-count patterns, not a documented policy —
   worth asking whether there's a real protocol (e.g. "every 4th session", "every 3
   months") to encode as a reminder/scheduling rule in the new system.
