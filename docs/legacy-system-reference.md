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
  Hilfsskripts/                <- shared helper scripts (score/plot/extract; see "The R driver scripts" below)
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
| **SBKJ-P** | Stundenbogen für Kinder und Jugendliche, Patientenversion — child/adolescent analogue of PSTB, ages ~7-18 | Child/adolescent | Self | 7 (0-6, 7-point Likert; verified — see below) | Therapiebeziehung = mean(I1 Beziehung, I2 Selbstvertrauen); Therapiebezogene_Selbstwirksamkeit = mean(I3 Problemlösen, I4, I5, I6 Mitentscheiden); I7 (Eltern helfen mit) tracked standalone, loads on neither factor | Every session (validated at sessions 2, 10, 18 in the source study) |
| **BDI-FS** | Beck Depression Inventory – Fast Screen | Adult (also used pediatric/medical) | Self | 7 (0-3 each) | BDI_FS_total = sum, tolerate ≤1 missing. Norms: 0-3 minimal, 4-6 mild, 7-9 moderate, 10-21 severe. Item 7 (suicide) also flagged individually. | Repeated, no fixed interval found in data |
| **DIKJ** | Depressionsinventar für Kinder und Jugendliche, ages 8-16 | Child/adolescent | Self | 29 | Gesamtrohwert = prorated sum: `sum/(29-n_missing)*29`, truncated | Periodic |
| **Conners 3** | ADHD rating scale | Child/adolescent | Self (long+short), Parent, Teacher | ~60-280 depending on form | Inconsistency Index, PE/NE impression indices, Impairment ratings, Content scales (Unaufmerksamkeit, Hyperaktivität/Impulsivität, Lernprobleme, Aggressives Trotzverhalten/EF, Familiäre Beziehungen), Conners 3 Index, DSM-IV-TR scales, ICD-10 scales | Diagnostic workup + periodic monitoring |
| **CBCL** | Child Behavior Checklist (Achenbach) | Child (school-age, parent-rated) | Parent | ~120 | Same activity/competence-scale and syndrome-scale structure as YSR below (parent-report item wording/numbering, not independently re-verified this pass — see YSR for the confirmed formula shape) | Intake + periodic + wave-based (embedded in Standarddiagnostik) |
| **YSR** | Youth Self-Report (Achenbach), self-report analogue of CBCL | Adolescent | Self | ~120 | Activity/competence: Akt_1a=SUM(3 items), Akt_1b/2b/4b=MEAN(items), etc., rolled into `YSR_Akt_Total_r`, `YSR_Komp_Total_r`, `YSR_Schule_Total_r` (each `RND(..., 0.5)`), `YSR_Gesamt_r` = sum of those 3. 8 syndrome scales, each `SUM` of 8-17 items: AD(13 items), RD(8), KB(8, incl. lettered 56a-g), SP(11), DP(12), AP(9), RV(14), AV(17), plus an "andere" residual scale (10 items) not part of INT/EXT. Composites: `YSR_INT=SUM(AD,RD,KB)`; `YSR_EXT=SUM(RV,AV)`; `YSR_GEMISCHT=SUM(SP,DP,AP,andere)`; `YSR_TOT=SUM(INT,EXT,GEMISCHT)` | Wave-based (embedded in adolescent Standarddiagnostik / Essstörungsdiagnostik) |
| **SDQ** | Strengths and Difficulties Questionnaire (Goodman) | Self (11-17), Parent (2-4, 4-17) | Self / Parent | 25 (5 reverse-scored: 7,11,14,21,25) | 5 subscales of 5 items each (EmoProbl, VerhProbl, Hyperak, VerhProblGleich, Prosoz) + GesProbl (Total Difficulties = sum of first 4, excludes Prosoz) | Screening; repeatable, cheap to re-administer |
| **Pediatric Symptom Checklist (clinic short form)** | 5-item ultra-brief version, **not** the standard PSC-17/PSC-35 | Child | Self / Parent | 5, categorical nie/manchmal/oft -> 0/1/2 | Gesamtscore = sum of 5 items | Screening |
| **SCID-5-SPQ** | Personality-disorder screening questionnaire preceding the SCID-5-PD structured interview | Adult | Self | 106 | No stored total — criterion-based scoring happens during the follow-up interview, not from this file | Once, at diagnostic workup |
| **Somatik** | SOMS-7T (somatoform symptom screening, 7-day) + TAS-20 (Toronto Alexithymia Scale) | Adult | Self | 132 + 20 | No computed totals in current data — raw items only `[UNCONFIRMED scoring]` | Intake diagnostics |
| **SRS** | Social Responsiveness Scale (autism-trait screener) | Child | Caregiver (Mutter/Vater) | ~65 | T-value subscales: Soziale Bewusstheit, Soziale Kognition, Soziale Kommunikation, Soziale Motivation, Autistische Manierismen | Rare in this dataset — handled on paper, not digitized |
| **FGG** | Fragebogen zu Gedanken und Gefühlen — Borderline-specific cognition screener | Adult/adolescent | Self | 37 (long form; 14-item short form also published) | GG_Mean (overall mean); IWD (contradictory-thinking index) = mean of 4 pairwise indices, each `(itemA*itemB)/(abs(itemA-itemB)+1)` | Screening / therapy planning, periodic |
| **EDE-Q8** | Eating Disorder Examination Questionnaire, 8-item short form | Adult/adolescent | Self | 8 | restraint=MEAN(1,2); weightconcern=MEAN(5,7); shapeconcern=MEAN(4,8); eatingconcern=MEAN(3,6); total=MEAN(4 subscales) | Wave-based / periodic, eating-disorder patients |
| **EDE (full)** | Full Eating Disorder Examination, used instead of EDE-Q8 in the two `*_Essstoerung.sps` files | Adult/adolescent | Self | 28 | restraint=MEAN(1-5); weightconcern=MEAN(8,12,22,24,25); shapeconcern=MEAN(6,8,10,11,23,26,27,28); eatingconcern=MEAN(7,9,19,20,21); total=MEAN(4 subscales). Item 8 is used in **both** weightconcern and shapeconcern (appears in both files identically — looks intentional, not a typo, but flag it). **Confirmed bug**: the adult file's `NMISS` completeness guard is `< 8` (copy-pasted from the EDE-Q8 threshold) instead of `< 28`, so adult full-EDE scores may compute from far more missing items than intended; the adolescent file has the correct `< 28` guard. | Wave-based, eating-disorder patients |
| **WBQ** | Binge-eating episode & compensatory-behavior frequency `[UNCONFIRMED published source]` | Adult/adolescent | Self | ~11 | Guard: `NMISS(WBQ2,WBQ3)=0`. `WBQ4A_Anzahl_Essanfälle`/`4B_Anzahl_Kontrollverlust`/`4C_Anzahl_Überessen` copy raw episode-count items, zeroed out per conditional rules (if WBQ2=0 → 4A,4C=0; if WBQ3=0 → 4A,4B=0). `WBQ13_Anzahl_Kompensation = MAX(WBQ13A,WBQ13B,WBQ13C)`. **Confirmed naming bug**: the adult file (`Syntax_Erwachsene_Essstoerung.sps`) uses underscored variable names (`WBQ_2`, `WBQ_4a`, `WBQ_13a`); the adolescent file (`Syntax_Adoleszenz_Essstoerung.sps`) uses no-underscore names (`WBQ2`, `WBQ4A`, `WBQ13A`) for the same instrument — a real raw-column-naming inconsistency between the two forms, not just a documentation quirk. | Wave-based, eating-disorder patients |
| **DEBQ** | Dutch Eating Behaviour Questionnaire (emotional eating) | Adult/adolescent | Self | 30 | `DEBQ_EmotionalEating = MEAN(DEBQ_1,4,6,8,9,11,14,17,22,30)` (10 items) | Wave-based, eating-disorder patients |
| **BSI** | Brief Symptom Inventory | Adult | Self | 53 | 9 subscales, each `SUM` of 4-7 items: Somatisierung(2,7,23,29,30,33,37), Zwang(5,15,26,27,32,36), SozUnsicherheit(20,21,22,42), Depressivität(9,16,17,18,35,50), Ängstlichkeit(1,12,19,38,45,49), Aggressivität(6,13,40,41,46), PhobischeAngst(8,28,31,43,47), Paranoid(4,10,24,48,51), Psychotizismus(3,14,34,44,53); `BSI_Zusatz = MEAN(11,25,39,52)*4`; `PST` = count of items scored 1-4; `PSDI = SUM(all)/PST`. **Confirmed bug**: `BSI_GSI = SUM(BSI_1 TO BSI_53)` in `Syntax_Erwachsene.sps`, but `BSI_GSI = MEAN(BSI_1 TO BSI_53)` in `Syntax_Erwachsene_Essstoerung.sps` — same variable name, different formula depending on which intake form a patient filled out. Mean is correct per the BSI manual. | Wave-based (Standarddiagnostik/Essstörungsdiagnostik, adult) |
| **SIAS** | Social Interaction Anxiety Scale (6-item short form used here) | Adult/adolescent | Self | 6 | `SIAS_total = SUM(SIAS1 TO SIAS6)` | Wave-based |
| **PHQ-4** | Patient Health Questionnaire, ultra-short depression/anxiety screener | Adult/adolescent | Self | 4 | `PHQ_total = SUM(PHQ1 TO PHQ4)` | Wave-based |
| **IIP-64** | Inventory of Interpersonal Problems | Adult | Self | 64 | 8 octant un-ipsatized means `IIP64_u{PA,BC,DE,FG,HI,JK,LM,NO}`, 8 items each (e.g. PA=17,31,44,45,50,52,57,59); parallel SUM versions `x*`; `IIP64_gesamt = MEAN(8 u-scales)`; ipsatized `IIP64_{octant} = xIIP64_u{octant} - xIIP64_gesamt*8` | Wave-based, adult |
| **DERS** | Difficulties in Emotion Regulation Scale | Adult | Self | 36 | Reverse-recodes items 1,2,6,7,8,10,17,20,22,24,34 (1↔5) into `*_umkod` first. 6 subscales, each `SUM` of 4-6 items: Nonacceptance(25,21,12,11,29,23), Goals(26,18,13,33,20r), Impulse(32,27,14,19,3,24r), Awareness(6r,2r,10r,17r,8r,34r), Strategies(16,15,31,35,28,22r,36,30), Clarity(5,4,9,7r,1r); `DERS_Total` = sum of the 6 subscales | Wave-based, adult |
| **FRKJ** | Fragebogen zu Ressourcen im Kindes- und Jugendalter (resilience/resources), ages 8-16 | Adolescent | Self | 60 | 10 subscales, each `SUM` of 6 items: Empathie(6,12,16,20,22,32), Selbstwirksamkeit(3,5,15,21,28,33), Selbstwertschätzung(7,17,25,29,31,34), Kohärenzsinn(9,13,14,18,24,27), Optimismus(1,2,4,8,11,26), Selbstkontrolle(10,19,23,30,35,36), elterliche Unterstützung(37,38,39,41,43,44), autoritative Erziehung(40,42,45,46,47,48), Peer-Integration(49,50,51,52,53,54), Schul-Integration(55,56,57,58,59,60); `FRKJ_Ges = MEAN(10 subscales)` | Wave-based, adolescent |
| **FEEL-KJ** | Fragebogen zur Erhebung der Emotionsregulation bei Kindern und Jugendlichen, ages 10-19 | Adolescent | Self | 90 | 15 base strategy subscales (POH, ZER, STI, AKZ, VER, KOG, UMB = adaptive; AUF, AGV, RÜC, SEL, PER = maladaptive; SOU, AUS, EMK = standalone), each `SUM` of 6 items, scored separately per emotion (Wut/Angst/Trauer — same item pattern repeated 3×). Per-emotion adaptive/maladaptive composites (e.g. `WUT_AS` = sum of 14 pooled adaptive items for anger) roll up into `ADAPTIVE_STRATEGIEN_GES`/`MALADAPTIVE_STRATEGIEN_GES` | Wave-based, adolescent |
| **TAIK / TAIE** | Adolescent/parent-analogue of the Trierer Alkoholismusinventar `[UNCONFIRMED — adult TAI is a documented 90-item instrument; child/parent variants not independently verified]` | Adolescent / Parent | Self / Parent | 12 | `TAIK_Total = SUM(TAIK_1..12)`. **Confirmed bug**: `TAIK_6` appears twice in the actual SUM call in `Syntax_Adoleszenz.sps` — likely a copy-paste error double-counting item 6 in every adolescent TAIK total. `TAIE_TOT` formula not independently re-verified this pass. | Wave-based |
| **IHS** | Locally labelled; subscales match Perceived Burdensomeness / Thwarted Belongingness — very likely the German-adapted Interpersonal Needs Questionnaire (INQ), tied to the interpersonal theory of suicide | Adult | Self | 10 | `Perceived_Burdensomeness = SUM(items 1-5)`; `Thwarted_Belongingness = SUM(items 6-10)` — 10 items total, not 15 as previously estimated | Wave-based, adult |
| **BMI** | Derived field (not a questionnaire), Essstörungsdiagnostik/adult only | Adult | — | 2 (height, weight) | `BMI = Gewicht_kg / (Groesse_cm * Groesse_cm) * 100 * 100` (algebraically = kg/m²) | Wave-based, eating-disorder patients |

**SBKJ-P provenance (resolved 2026-07-03).** Item wording and the verified 0-6
response scale come from the primary validation study: In-Albon, Munsch,
Vonderlin, Kalmar, Brodard, Flückiger, Gutzweiler, Kircher & Mander (2021),
"Therapieprozesse in der Kinder- und Jugendlichenpsychotherapie: Evaluation des
Patientenstundenbogens für Kinder und Jugendliche," *Kindheit und Entwicklung*
30(1), 63-75. The original SBKJ-P pool had 11 items across six intended
constructs (resource activation, problem actuation, coping, motivational
clarification, therapeutic alliance, parents' role); psychometric screening
(non-normal item distributions, poor item difficulty/discrimination) eliminated
4 items — including the only two reverse-scored items in the pool
(dissatisfaction-with-therapy and parental-pressure) — leaving the 7-item
version the clinic's own `Kinderstundenbogen.sav`/`Syntax_SBKJ.sps` already
implements. An exploratory factor analysis on those 7 items recovered exactly
the two-factor structure the clinic's syntax encodes (Beziehung = items 1-2,
therapiebezogene Selbstwirksamkeit = items 3-6), with item 7 (parents' role)
retained as a standalone item that loads on neither factor. One divergence
worth flagging: the paper's own descriptive statistics (its Table 2) report
the subscales and total as raw **sums** (e.g. Beziehung range 5-12,
Selbstwirksamkeit range 7-24), while the clinic's syntax computes them as
**means** (0-6) — likely so every scale can share one y-axis regardless of
item count, the same convention PSTB uses. This looks intentional, not a bug,
but is worth confirming with the clinic if exact comparison to the published
norms ever matters.

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

## The R driver scripts, in full (resolved 2026-07-03 via `attachments/`)

The clinic supplied 13 files (`PTPS/attachments/`) that fill in scripts previously known
only by reference or not at all. `PSTB_Daten_Hilfsskript.R` and `Plots_Hilfsskript.R` —
previously missing from disk, see the resolved gap below — are among them, confirming
the pipeline description above. Five more R scripts round out the picture:

- **`Auswertung_BDI-FS.R`** — driver for BDI-FS. Reads `BDI-FS.sav`; if
  `extract_additional_bdi_scores` is set, first sources `Extraktion_Verlaufsdiagnostik_Hilfsskript.R`
  to pull in scores from the Standarddiagnostik/Essstörungsdiagnostik files, then
  **writes the merged result back into `BDI-FS.sav`** via `write_sav()` — a mutating
  side effect worth knowing about if this pipeline is ever re-run, since `BDI-FS.sav`
  is not purely BDI-FS data after that. Then sources `BDI_FS_Daten_Hilfsskript.R` (xlsx)
  and `Plots_Hilfsskript.R` (docx).
- **`Auswertung_PSTB.R`** — driver for the adult PSTB, structurally identical to
  `Auswertung_SBKJ.R` but pointed at `Patientenstundenbogen.sav` / `Pat_Num` and the
  8 adult scale names.
- **`Auswertung_Verlaufsmessung.R`** — the "everything else" driver: combines BDI-FS
  with all 5 Standarddiagnostik/Essstörungsdiagnostik `.sav` files, sources
  `Extraktion_Verlaufsdiagnostik_Hilfsskript.R` → `Plots_Hilfsskript.R` →
  **`Itemweise_Auswertung_Hilfsskript.R`** (see below). Explicitly resets
  `colnames_to_extract_manual`/`new_names` to `NULL` at the top, with a comment
  noting this "fixes a problem if BDI-FS was evaluated first" in the same R
  session — evidence the scripts share global state across `source()` calls and
  are order-sensitive, not independently reusable.
- **`Extraktion_Verlaufsdiagnostik_Hilfsskript.R`** — generic long-format extractor:
  for each configured `.sav` file, intersects its columns with the `Skalen.sav`
  catalog (`scales$Fragebogen`) unless a manual column list is supplied, row-binds
  everything, deduplicates by `(Code, Datum)`. This is the **current, generalized**
  replacement for the archived `Extraktion_Verlaufsdiagnostik_Hilfsskript_alt.R`: the
  old version required a hardcoded column whitelist and a hardcoded file list per
  caller; the new version defaults to auto-selecting columns via the `Skalen.sav`
  catalog and takes the file list as a parameter, and drops an old NA-row-filtering
  step (rows aren't discarded just because every extracted scale is NA anymore).
- **`Itemweise_Auswertung_Hilfsskript.R`** (460 lines, the largest attachment) — **not**
  a scale-trajectory report like the other Hilfsskripts. It produces one workbook per
  patient with **one sheet per measurement timepoint** (named from `Typ`+`Datum`,
  e.g. "Prä 12.03.24"), dumping **every raw item** for every instrument present at
  that timepoint — item id, numeric value, and its SPSS value label — grouped under
  hardcoded section headers per instrument (BSI, YSR, CBCL, IHS-d, BDI-FS, SIAS,
  PHQ-4, TAIK, DERS, FRKJ, FEEL-KJ, EDEQ-8, full EDE, DEBQ, WBQ, SCID-5-SPQ). No
  charts, no cross-timepoint comparison, no `Skalen.sav` involvement — this is a
  raw-answer audit view (e.g. "which exact BSI or SCID-5-SPQ items drove this
  subscale") rather than a progress-tracking report. It is a fixed, hand-maintained
  item-index catalog (not table-driven), which is itself a source of the exact
  item→scale mappings recorded in the table below.

## Gaps and open questions (validate with the clinic before assuming)

1. **Patient code scheme.** `A`/`C` prefixes correlate with the age-group split seen
   across files (plausibly adult vs. child/adolescent); a few `B...` codes and one
   `BEAT_...` code don't fit that pattern and may indicate a separate cohort/study.
2. **WBQ and TAIK/TAIE published source.** Their exact scoring *formulas* are now
   confirmed (see the instrument table above), but which published manual (if any)
   they come from — vs. being clinic-internal adaptations — is still unconfirmed.
3. ~~Missing helper scripts~~ — **resolved 2026-07-03**: `PSTB_Daten_Hilfsskript.R`
   and `Plots_Hilfsskript.R` were supplied directly by the clinic (`attachments/`)
   and read in full; see the pipeline description and instrument table above.
4. **Confirmed scoring bugs in the legacy `.sps` syntax** (worth knowing if this
   pipeline is ever re-run for real, and worth NOT silently replicating in the new
   system):
   - `BSI_GSI`: `SUM` in `Syntax_Erwachsene.sps` vs. `MEAN` (correct per manual) in
     `Syntax_Erwachsene_Essstoerung.sps` — same variable, different formula
     depending on which intake form a patient filled out.
   - `TAIK_Total`: item 6 is summed twice in `Syntax_Adoleszenz.sps` (copy-paste
     duplication in the `SUM(...)` argument list).
   - Full-EDE completeness guard: `NMISS(EDE1 TO EDE28) < 8` in
     `Syntax_Erwachsene_Essstoerung.sps` (copy-pasted from the EDE-Q8 threshold,
     should be `< 28`); the adolescent file has the correct `< 28` guard.
   - `WBQ` raw item names are inconsistent between forms: underscored
     (`WBQ_2`, `WBQ_4a`) in the adult Essstörung syntax, no underscore (`WBQ2`,
     `WBQ4A`) in the adolescent one — same instrument, different column-naming
     convention.
5. **No scoring syntax exists** for `Somatik.sav` (SOMS-7T/TAS-20) or `SCID-5-SPQ.sav`
   — only raw items are stored; total/subscale formulas need to come from the
   published manuals, not from this codebase. (`SCID-5-SPQ` is a screening
   checklist reviewed item-by-item before a structured interview, not scored to a
   total, so this may be by design rather than a gap — worth confirming.)
6. **Exact administration cadence** for the "periodic" instruments (BDI-FS, SDQ,
   Conners 3, DIKJ) is inferred from row-count patterns, not a documented policy —
   worth asking whether there's a real protocol (e.g. "every 4th session", "every 3
   months") to encode as a reminder/scheduling rule in the new system.
