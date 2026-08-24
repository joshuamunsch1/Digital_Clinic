// Age-band matching of instrument `population` slugs (client-safe, pure).
//
// The old check was purely textual (age < 18 → any slug containing
// "child|adolescent"), which offered a 5-year-old the SDQ 11–17 and the DIKJ
// 8–16, and a 9-year-old the adult_adolescent PHQ-4. Administering a normed
// instrument outside its age band invalidates the norms, so the slugs'
// explicit ranges are parsed and enforced here.
//
// Stage bands (for slugs without an explicit numeric range) [clinician-confirm]:
//   adult      >= 18
//   adolescent 11–17
//   child      <= 12   (child_school_age: 6–12)
// Overlaps between stages (an 11–12-year-old matches child AND adolescent) are
// deliberate — border ages are a clinical judgment call, so both forms are
// offered rather than neither.
import type { InstrumentDef } from "./types";
import { demographicAge, type Patient } from "../types";

const RANGE_RE = /_(\d+)_(\d+)$/;

/// Does a numeric age fall inside the population slug's band?
export function ageMatchesPopulation(population: string, age: number): boolean {
  if (population === "all") return true;
  const range = population.match(RANGE_RE);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return age >= lo && age <= hi;
  }
  if (population.includes("adult") && age >= 18) return true;
  if (population.includes("adolescent") && age >= 11 && age <= 17) return true;
  if (population.includes("child_school_age")) return age >= 6 && age <= 12;
  if (population.includes("child") && age <= 12) return true;
  return false;
}

/// Instrument population fit for a patient. Unknown age keeps the previous
/// conservative fallback: only adult-suitable instruments match (never a
/// child-normed form for a patient whose age we do not know).
export function populationMatches(inst: Pick<InstrumentDef, "population">, patient: Patient): boolean {
  if (inst.population === "all") return true;
  const age = demographicAge(patient.demographics);
  if (age === null) return inst.population.includes("adult");
  return ageMatchesPopulation(inst.population, age);
}
