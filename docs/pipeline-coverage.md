# Legacy pipeline coverage: what's implemented, what isn't

This is the master cross-reference between every data-processing script found in the
PTPS folder and its status in this codebase. See `legacy-system-reference.md` for what
each script/instrument actually does, and `target-data-model.md` for the architecture
that replaces them. Audited 2026-07-03 against `docs/instrument-catalog.json` +
`src/lib/instruments/catalog.ts` as they stood after the PSTB/SBKJ/therapist-attribution
work earlier that day.

## Scoring syntax (`Daten_SPSS/**/*.sps`) → `Instrument` catalog entries

| Legacy `.sps` file | Instrument(s) it scores | Status in `instrument-catalog.json` | Notes |
|---|---|---|---|
| `BDI_FS/Syntax_BDI-FS.sps` | BDI-FS | ✅ `bdi_fs` — `complete`, scoreable | Verified faithful (missing-tolerance sum, suicide-item alert, RCI placeholder) |
| `DIKJ/DIKJ_Syntax.sps` | DIKJ | ✅ `dikj` — `complete`, scoreable | Prorated-sum formula matches |
| `FGG/SyntaxFGG.sps` | FGG | ✅ `fgg` — `complete`, scoreable | Ambivalence-index custom formula matches |
| `Patientenstundenbogen/Syntax_PSTB.sps` | PSTB (adult) | ✅ `pstb_adult` — `complete`, scoreable | Real item text (BSTB-PT.pdf), verified −3..+3, reverse items I8/I12/I14/I19 all confirmed against this syntax |
| `Patientenstundenbogen/Syntax_SBKJ.sps` | SBKJ-P (child/adolescent) | ✅ `sbkj_child` — `complete`, scoreable | Fixed 2026-07-03: real item text from In-Albon et al. (2021), verified 0..6 range — previously had placeholder ids/assumed range |
| `SDQ/Syntax_SDQ.sps` | SDQ (self 11-17, parent 4-17, parent 2-4) | ✅ `sdq_self_11_17`, `sdq_parent_4_17`, `sdq_parent_2_4` — `complete`, scoreable | All 3 rater variants present |
| `Pediatric Symptom Checklist/Syntax_Pediatric-Symptom-Checklist.sps` | PSC (5-item clinic short form) | ⚠️ `psc_short_self` only — `complete`, scoreable | **Gap**: the legacy folder has a parent-report (`Fremdbeurteilung`) `.sav` too; no corresponding catalog entry exists. Same formula would apply, just a different `raterRole` — small, well-scoped addition if needed. |
| `WBQ und EDEQ-8/Syntax_EDE-Q8.sps` | EDE-Q8 | ✅ `edeq8` — `complete`, scoreable | 4-subscale pairwise-mean formula matches |
| `WBQ und EDEQ-8/Syntax_WBQ.sps` | WBQ | ⚠️ `wbq` — `partial`, **not** scoreable | Catalog has the right scale keys but no item list; full formula now documented in `legacy-system-reference.md` (episode-count zeroing rules + max-of-compensation-items), ready to transcribe |
| `Standarddiagnostik/Syntax_Erwachsene.sps` | BSI, IIP-64, BDI-FS, SIAS, PHQ-4, DERS, EDE-Q8, IHS-d (adult "Standarddiagnostik" battery) | ❌ `adult_composite_battery` — `not_extracted`, no items/scales at all | Individual instruments (BSI, IIP-64, SIAS, PHQ-4, DERS, IHS-d) don't exist as standalone catalog entries either. Full formulas for all of these are now documented in `legacy-system-reference.md` — this is real, ready-to-build follow-up work, not a research gap anymore. |
| `Standarddiagnostik/Syntax_Adoleszenz.sps` | YSR, BDI-FS, SIAS, PHQ-4, FRKJ, FEEL-KJ, TAIK, EDE-Q8 (adolescent battery) | ❌ same `adolescent_composite_battery` placeholder | Same situation — YSR, FRKJ, FEEL-KJ, TAIK, SIAS, PHQ-4 have no standalone catalog entries; formulas now documented |
| `Standarddiagnostik/Syntax_Unter_und_Mittelstufe_Eltern.sps` | CBCL, TAIE (parent-report, school-age) | ⚠️ `cbcl_parent` — `partial`, not scoreable; no TAIE entry at all | CBCL's formula structure is now documented (via YSR, same family); TAIE not independently re-verified |
| `Standarddiagnostik/Syntax_KK_bis_5_Jahre.sps` | SDQ 2-4 (early childhood) | ✅ covered by `sdq_parent_2_4` | Same SDQ formula; the "early-childhood battery" framing itself isn't a separate catalog concept, which is fine — the instrument is what matters |
| `Essstoerungsdiagnostik/Syntax_Erwachsene_Essstoerung.sps` | BSI, IIP-64, BDI-FS, SIAS, PHQ-4, DERS, full EDE, DEBQ, IHS-d, BMI, WBQ (adult eating-disorder battery) | ❌ no dedicated entry (overlaps `adult_composite_battery` placeholder) | Contains the confirmed `BSI_GSI` bug (SUM here vs. MEAN in the plain Standarddiagnostik file) and the EDE `NMISS<8` threshold bug — see below |
| `Essstoerungsdiagnostik/Syntax_Adoleszenz_Essstoerung.sps` | YSR, BDI-FS, SIAS, PHQ-4, FRKJ, FEEL-KJ, full EDE, DEBQ, WBQ (adolescent eating-disorder battery) | ❌ no dedicated entry | Contains the confirmed `TAIK_6` double-count and `WBQ` variable-naming-inconsistency bugs |
| `Conners3/*` (no separate `.sps` filename recorded, scoring described inline per rater folder) | Conners 3 (self short/long, parent, teacher) | ⚠️ `conners3_self_short` — `partial`, not scoreable | Scale *names* captured (Rohwert_UA/HI/LP/AT/FB/PE/NE); item-level formula not transcribed |
| *(none — raw items only)* | Somatik (SOMS-7T + TAS-20) | ❌ `somatik` — `not_extracted` | No scoring syntax exists anywhere in the legacy system either — formulas would have to come from the published SOMS/TAS-20 manuals, not from this codebase |
| *(none — raw items only)* | SCID-5-SPQ | ❌ `scid5_spq` — `not_extracted` | By design, not a gap: it's a screening checklist read item-by-item before a structured interview, not summed to a score. Recommendation stands (see `target-data-model.md`): model as `instrumentType: "structured_interview"` like DIPS, not `likert_battery`, once built. |
| *(paper form, OCR'd only)* | SRS | ❌ `srs_caregiver` — `not_extracted` | Never digitized in the legacy system either (see `Paper-Pencil-Diagnostik`) |
| *(none)* | CBCL | see `Unter_und_Mittelstufe_Eltern.sps` row above | |

## R reporting pipeline → live app equivalents

| Legacy script | What it does | Live equivalent | Status |
|---|---|---|---|
| `PSTB_Daten_Hilfsskript.R` | Transposed xlsx (scale rows × session columns), `Sitzung`-numbered, `TherapeutIn` header row | `ScoreTable` (charts.tsx) + `ResponseInstance.sessionNumber` + new `conductedById` field (added 2026-07-03) | ✅ Implemented, session-number and now therapist-attribution semantics both match |
| `Plots_Hilfsskript.R` | Per-scale line chart into a Word template, y-axis from `Skalen.sav` Min/Max, printed norm/Norm caption | `TrajectoryChart` (charts.tsx): fixed y-axis from `Scale.range`, shaded `normBands` instead of a caption, "therapy begins" reference line | ✅ Implemented as a live interactive chart instead of a generated document — a reasonable re-imagining, not a gap |
| `BDI_FS_Daten_Hilfsskript.R` | BDI-FS-specific xlsx export with hardcoded norm/legend text | `ScoreTable` + `Scale.normBands` on `bdi_fs` | ✅ Implemented |
| `Auswertung_SBKJ.R`, `Auswertung_PSTB.R`, `Auswertung_BDI-FS.R` | Per-instrument driver scripts (read `.sav` → filter to patient → score → plot → write files) | The API/UI flow (`InstrumentForm` submit → `computeScaleScores` → `TrajectoryChart`/`ScoreTable`) | ✅ Implemented — a live app replaces the "run a script per patient" workflow entirely, which is the point |
| `Auswertung_Verlaufsmessung.R` | Driver for the big composite batteries + item-level dump | No equivalent yet | ❌ Blocked entirely on the composite-battery instruments not being onboarded (see table above) — there's nothing to drive yet |
| `Extraktion_Verlaufsdiagnostik_Hilfsskript.R` (and archived `_alt` version) | Merges several wide, one-row-per-timepoint `.sav` files into one long-format table keyed by (Code, Datum) | Not needed | ✅ **Architecturally obviated**: `ResponseInstance` is already one row per (patient, instrument, occasion) — the new data model is the long format this script exists to produce. Nothing to port. |
| `Itemweise_Auswertung_Hilfsskript.R` | One workbook per patient, one sheet per timepoint, every raw item + SPSS label, grouped by instrument | The "View answers" expandable panel in `ResponseRow` (PatientDetail.tsx) shows raw items + values + computed scores per response | ⚠️ **Partially implemented, differently organized**: covers the same need (see exactly what was answered) per-instrument-per-response rather than per-timepoint-across-instruments, which fits the new data model naturally. But it only helps for instruments that exist in the catalog — for BSI/IIP-64/DERS/YSR/FRKJ/FEEL-KJ/TAIK/full-EDE/DEBQ/SCID-5-SPQ etc. there's no response to expand yet, so this is blocked on the same gap as the row above. |

## Bottom line

**Fully implemented and verified faithful to the legacy scoring/reporting logic**: PSTB,
SBKJ-P, BDI-FS, DIKJ, FGG, EDE-Q8, SDQ (all 3 rater variants) — 9 instruments, all the
ones that were session-based or standalone in the legacy system. The reporting side
(trajectory charts, transposed score tables, per-session therapist attribution) is a
faithful, arguably improved live-app replacement for the R/xlsx/docx pipeline for these.

**Not implemented**: everything that lived inside the two big "Standarddiagnostik" /
"Essstörungsdiagnostik" composite batteries — BSI, IIP-64, DERS, SIAS, PHQ-4, YSR, CBCL,
FRKJ, FEEL-KJ, TAIK/TAIE, full EDE, DEBQ, WBQ (formula known, not yet wired up), Conners
3 (all raters), plus SCID-5-SPQ, Somatik, and SRS. None of these can currently be filled
out, scored, or charted in the app — they exist only as inert placeholder rows or, for
the two batteries themselves, aren't represented at all beyond a `sourceNotes` prose
description. This is the large remaining body of work, but it's no longer a *research*
gap: exact item→scale formulas for BSI, IIP-64, DERS, SIAS, PHQ-4, YSR, FRKJ, FEEL-KJ,
TAIK, full EDE, DEBQ, and WBQ are now fully documented in `legacy-system-reference.md`
(sourced directly from the `.sps` syntax via `attachments/`), ready to transcribe into
`instrument-catalog.json` entries the same way PSTB/SBKJ/BDI-FS/etc. already are. CBCL,
Conners 3, SCID-5-SPQ, Somatik, SRS, and TAIE still need their item-level detail sourced
(published manuals or further clinic-provided material, the same way BSTB-PT.pdf and the
SBKJ-P paper resolved PSTB/SBKJ).

**Bugs found in the legacy `.sps` syntax while extracting these formulas** (do not
replicate when building the missing instruments — see `legacy-system-reference.md` §
"Confirmed scoring bugs" for exact quotes): `BSI_GSI` computed as `SUM` in one file and
`MEAN` in another; `TAIK_Total` double-counts item 6; the adult full-EDE completeness
guard uses the wrong threshold (`<8` instead of `<28`); `WBQ` raw item names are
inconsistent between the adult and adolescent forms.

**One latent bug found and fixed in this codebase**: `cbcl_parent`'s placeholder item id
(`"CBCL_*"`) didn't match the filter that's supposed to keep `partial`/`not_extracted`
catalog entries inert (no fillable items), so it would have rendered one bogus Likert
field with no defined range. Fixed in `src/lib/instruments/catalog.ts` by widening the
placeholder-id filter from "contains `..`" to "contains `..` or `*`".
