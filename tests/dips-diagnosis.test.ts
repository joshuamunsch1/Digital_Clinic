// DIPS structured interview: skip logic / completeness (src/lib/dips/engine.ts),
// submission validation (validate.ts) and the rule-based diagnosis derivation
// (diagnosis.ts) — pure, no DB. Structure and criterion mapping follow the
// DIPS Open Access 1.2 Interviewleitfaden / Protokollbogen.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveDiagnoses, evaluateDips, primaryProposal } from "../src/lib/dips/diagnosis";
import { MODULES } from "../src/lib/dips/schema";
import { allComplete, effectiveModule, isVisible, moduleComplete } from "../src/lib/dips/engine";
import { validateDipsSubmission } from "../src/lib/dips/validate";
import { toFHIR } from "../src/lib/dips/fhir";
import { DEMO_PATIENTS, SAMPLE_ANSWERS, buildDipsAnswers } from "../src/lib/demo";
import type { DipsAnswers, ModuleAnswers } from "../src/lib/types";

const mod = (id: string) => MODULES.find((m) => m.id === id)!;
const evalOf = (answers: DipsAnswers, id: string, age?: number) => evaluateDips(answers, { age }).find((e) => e.moduleId === id)!;
const criterion = (answers: DipsAnswers, id: string, key: string) => evalOf(answers, id).criteria.find((c) => c.key === key);

test("demo panic answers derive exactly one proposal: Panikstörung F41.0", () => {
  const met = deriveDiagnoses(SAMPLE_ANSWERS);
  assert.equal(met.length, 1);
  assert.equal(met[0].diagnosis, "panic_disorder");
  assert.equal(met[0].icdCode, "F41.0");
  assert.ok(met[0].criteria.every((c) => c.met));
  assert.equal(primaryProposal(SAMPLE_ANSWERS)?.icdCode, "F41.0");
  assert.match(met[0].suggestedText, /Panikstörung \(ICD-10 F41\.0\)/);
});

test("empty answers derive nothing; all six modules still evaluate", () => {
  assert.deepEqual(deriveDiagnoses({}), []);
  assert.equal(primaryProposal({}), null);
  const all = evaluateDips({});
  assert.equal(all.length, 6);
  assert.ok(all.every((e) => !e.entered && !e.met));
});

const GAD_POSITIVE: ModuleAnswers = {
  "1.1": "yes",
  "1.3": "yes",
  worries_family_primary: "yes",
  worries_work_primary: "yes",
  symptoms_restless_primary: "yes",
  symptoms_tension_primary: "yes",
  symptoms_sleep_primary: "yes",
  impact_impair: 5,
  impact_distress: 4,
};

test("hand-built GAD answers derive F41.1", () => {
  const met = deriveDiagnoses({ gad: GAD_POSITIVE });
  assert.equal(met.length, 1);
  assert.equal(met[0].diagnosis, "gad");
  assert.equal(met[0].icdCode, "F41.1");
});

test("subthreshold impairment blocks the proposal", () => {
  const sub: DipsAnswers = { gad: { ...GAD_POSITIVE, impact_impair: 2, impact_distress: 3 } };
  assert.deepEqual(deriveDiagnoses(sub), []);
  const gadEval = evalOf(sub, "gad");
  assert.equal(gadEval.entered, true); // screened positive, criteria not met
  assert.equal(gadEval.criteria.find((c) => c.key === "impact")?.met, false);
});

test("either impairment OR distress >= 4 satisfies the distress criterion", () => {
  assert.equal(deriveDiagnoses({ gad: { ...GAD_POSITIVE, impact_impair: 1, impact_distress: 4 } }).length, 1);
  assert.equal(deriveDiagnoses({ gad: { ...GAD_POSITIVE, impact_impair: 4, impact_distress: 0 } }).length, 1);
});

test("organic/substance answers become caveats, not blocks", () => {
  const withOrganic: DipsAnswers = {
    panic: { ...SAMPLE_ANSWERS.panic, organic: "yes", organic_text: "Schilddrüse" },
  };
  const met = deriveDiagnoses(withOrganic);
  assert.equal(met.length, 1);
  assert.ok(met[0].caveats.length >= 1);
});

test("a substance judged not to cause the symptoms raises no caveat", () => {
  const caveats = (extra: ModuleAnswers) => evalOf({ panic: { ...SAMPLE_ANSWERS.panic, ...extra } }, "panic").caveats.length;
  const base = caveats({});
  assert.equal(caveats({ subst1: "yes", subst2: "no" }), base);
  assert.equal(caveats({ subst1: "yes", subst2: "yes" }), base + 1);
});

const AGORA_POSITIVE: ModuleAnswers = {
  "1.1": "yes",
  "1.2": "yes",
  // two of five situation areas
  grid_bus_primary: "yes", grid_bus_sev: 3, grid_bus_avoid: "yes", // transport
  grid_crowd_primary: "yes", grid_crowd_sev: 2, // crowds
  "4": "yes", // almost every time (criterion C)
  approp: "no", // fear judged disproportionate (criterion E)
  dur6: "yes",
  impact_impair: 5,
  impact_distress: 6,
};

test("agoraphobia alongside panic codes F40.01; alone F40.00", () => {
  const combined = deriveDiagnoses({ panic: SAMPLE_ANSWERS.panic, agora: AGORA_POSITIVE });
  const agoraEval = combined.find((e) => e.moduleId === "agora")!;
  assert.equal(agoraEval.icdCode, "F40.01");
  assert.match(agoraEval.suggestedText, /F40\.01/);

  const alone = deriveDiagnoses({ agora: AGORA_POSITIVE });
  assert.equal(alone.length, 1);
  assert.equal(alone[0].icdCode, "F40.00");
});

test("agoraphobia requires two situation AREAS, not two rows in one", () => {
  const oneArea: ModuleAnswers = {
    ...AGORA_POSITIVE,
    grid_crowd_primary: "no",
    grid_train_primary: "yes", grid_train_sev: 3, // same transport area as the bus
  };
  assert.deepEqual(deriveDiagnoses({ agora: oneArea }), []);
  assert.equal(criterion({ agora: oneArea }, "agora", "situations")?.met, false);
});

test("'alone at home' is item 3.15 of the enclosed-places area and counts toward it", () => {
  const answers: DipsAnswers = {
    agora: {
      ...AGORA_POSITIVE,
      grid_crowd_primary: "no",
      grid_alonehome_primary: "yes", grid_alonehome_sev: 3, grid_alonehome_avoid: "yes", // enclosed places
    },
  };
  assert.equal(criterion(answers, "agora", "situations")?.met, true); // transport + enclosed
  assert.equal(deriveDiagnoses(answers).length, 1);
});

test("a ticked situation counts unless explicitly rated below 'starke Angst'", () => {
  const withCrowd = (crowd: ModuleAnswers): DipsAnswers => ({ agora: { ...AGORA_POSITIVE, grid_crowd_sev: undefined, ...crowd } });
  // The 0–3 rating is optional in the interview: the tick alone is the answer.
  assert.equal(criterion(withCrowd({ grid_crowd_avoid: "no" }), "agora", "situations")?.met, true);
  assert.equal(criterion(withCrowd({ grid_crowd_avoid: "no", grid_crowd_sev: 1 }), "agora", "situations")?.met, false);
  assert.equal(criterion(withCrowd({ grid_crowd_avoid: "yes", grid_crowd_sev: 1 }), "agora", "situations")?.met, true);
});

test("a fear the interviewer judges appropriate is not proposed as a phobic disorder", () => {
  const appropriate: DipsAnswers = { agora: { ...AGORA_POSITIVE, approp: "yes" } };
  assert.deepEqual(deriveDiagnoses(appropriate), []);
  assert.equal(criterion(appropriate, "agora", "disproportionate")?.met, false);
  // Never assessed (interviews predating the item) is not met either.
  const unasked: DipsAnswers = { agora: { ...AGORA_POSITIVE, approp: undefined } };
  assert.deepEqual(deriveDiagnoses(unasked), []);
});

test("demo DIPS profiles derive the diagnoses the seed records", () => {
  // p3 Elif — GAD F41.1; p6/p10 — social F40.1; p7 — specific phobia F40.2
  assert.equal(primaryProposal(buildDipsAnswers(["gad"]))?.icdCode, "F41.1");
  assert.equal(primaryProposal(buildDipsAnswers(["social"]))?.icdCode, "F40.1");
  const phobia = primaryProposal(buildDipsAnswers(["phobia"]));
  assert.equal(phobia?.icdCode, "F40.2");
  assert.match(phobia!.suggestedText, /Tier-Typus/); // subtype from the checklist group
  assert.match(phobia!.criteria.find((c) => c.key === "stimuli")!.detail!, /Spinnen/); // free-text animal
  // p11 Rahel — panic + agoraphobia: ICD-10 codes F40.01 (agoraphobia WITH
  // panic disorder) and suppresses the standalone F41.0 proposal; the panic
  // evaluation stays visible as met-but-subsumed.
  const met = deriveDiagnoses(buildDipsAnswers(["panic", "agora"]));
  assert.deepEqual(met.map((e) => e.icdCode), ["F40.01"]);
  const panicEval = evaluateDips(buildDipsAnswers(["panic", "agora"]))[0];
  assert.equal(panicEval.met, true);
  assert.equal(panicEval.suppressed, true);
  // p1 Mara — panic only (negative screens on the other five don't leak in)
  const panicOnly = deriveDiagnoses(buildDipsAnswers(["panic"]));
  assert.equal(panicOnly.length, 1);
  assert.equal(panicOnly[0].icdCode, "F41.0");
});

test("all-negative interview evaluates cleanly with no proposal", () => {
  const answers = buildDipsAnswers([]);
  assert.deepEqual(deriveDiagnoses(answers), []);
  assert.ok(evaluateDips(answers).every((e) => !e.entered && !e.met));
});

test("every demo patient carries a DIPS interview the form could have submitted", () => {
  assert.equal(DEMO_PATIENTS.length, 12);
  assert.ok(DEMO_PATIENTS.every((p) => p.dips && p.dips.completedAt));
  // Complete, schema-valid and free of answers under skipped questions.
  for (const p of DEMO_PATIENTS) {
    const answers = buildDipsAnswers(p.dips.positive);
    const checked = validateDipsSubmission(answers);
    assert.deepEqual(checked.ok ? [] : checked.problems, [], `${p.id}`);
    assert.deepEqual(checked.ok && checked.answers, answers, `${p.id}: fixture carries skipped answers`);
  }
});

const SOCIAL_POSITIVE: ModuleAnswers = {
  "1.1": "yes", "1.2": "yes",
  "2.1": "yes",
  grid_speak_primary: "yes", grid_speak_sev: 3, grid_speak_avoid: "yes",
  grid_party_primary: "yes", grid_party_avoid: "yes",
  "6": "yes", "4.2": "yes", approp: "no",
  impact_impair: 8, impact_distress: 8,
};

test("primaryProposal picks the highest-impact met module", () => {
  const primary = primaryProposal({ panic: { ...SAMPLE_ANSWERS.panic, clinsev_sev: undefined }, social: SOCIAL_POSITIVE });
  assert.equal(primary?.diagnosis, "social_anxiety"); // (8+8)/2 > (6+7)/2
  // A recorded severity rating ranks ahead of the impairment/distress mean.
  const rated = primaryProposal({ panic: { ...SAMPLE_ANSWERS.panic, clinsev_sev: 8 }, social: { ...SOCIAL_POSITIVE, clinsev_sev: 5 } });
  assert.equal(rated?.diagnosis, "panic_disorder");
});

test("lifetime-only answers never produce a current diagnosis proposal", () => {
  // No current attacks, one phase years ago with a month of worry.
  const lifetimePanic: DipsAnswers = {
    panic: {
      "1.1": "no", "1.2": "yes", "2.2": "yes", "3": "yes",
      symptoms_s1_primary: "yes", symptoms_s2_primary: "yes", symptoms_s3_primary: "yes", symptoms_s4_primary: "yes",
      "7": "yes", "8.1": "no", "8.2": "no", "8.3": "no", "8.4": "no", "9": "no",
      impact_impair: 5, impact_distress: 5,
    },
  };
  assert.deepEqual(deriveDiagnoses(lifetimePanic), []);
  const e = evaluateDips(lifetimePanic)[0];
  assert.equal(e.entered, true);
  assert.equal(e.criteria.find((c) => c.key === "current")?.met, false);
  assert.ok(e.caveats.length >= 1); // lifetime caveat

  // GAD has a lifetime branch too (1.4–1.7, 4.2): entered, but never current.
  const lifetimeGad: DipsAnswers = { gad: { ...GAD_POSITIVE, "1.1": "no", "1.3": undefined, "1.4": "yes", "1.6": "yes", "4.2": "yes" } };
  assert.deepEqual(deriveDiagnoses(lifetimeGad), []);
  const g = evalOf(lifetimeGad, "gad");
  assert.equal(g.entered, true);
  assert.deepEqual(g.criteria.filter((c) => !c.met).map((c) => c.key), ["current"]);
});

test("severity rating: the subclinical range blocks, the distress criterion stands on its own", () => {
  // Rated 2 (subclinical, 0–3): not proposed despite high impairment/distress.
  assert.deepEqual(deriveDiagnoses({ gad: { ...GAD_POSITIVE, clinsev_sev: 2 } }), []);
  assert.equal(deriveDiagnoses({ gad: { ...GAD_POSITIVE, clinsev_sev: 4 } }).length, 1);
  // The severity rating does not override the starred impairment/distress item …
  const lowImpact: DipsAnswers = { gad: { ...GAD_POSITIVE, impact_impair: 1, impact_distress: 1, clinsev_sev: 5 } };
  assert.deepEqual(deriveDiagnoses(lowImpact), []);
  assert.equal(criterion(lowImpact, "gad", "impact")?.met, false);
  // … but stands in for it on interviews recorded without those ratings.
  const unrated: DipsAnswers = { gad: { ...GAD_POSITIVE, impact_impair: undefined, impact_distress: undefined, clinsev_sev: 5 } };
  assert.equal(deriveDiagnoses(unrated).length, 1);
});

test("panic disorder carries no distress criterion; a subclinical rating still blocks", () => {
  const { impact_impair: _i, impact_distress: _d, clinsev_sev: _s, ...panic } = SAMPLE_ANSWERS.panic;
  // Criteria A + B alone (item 17 is unstarred in the panic section).
  assert.equal(deriveDiagnoses({ panic }).length, 1);
  const low = evalOf({ panic: { ...panic, impact_impair: 2, impact_distress: 1 } }, "panic");
  assert.equal(low.met, true);
  assert.equal(low.caveats.length, evalOf({ panic }, "panic").caveats.length + 1); // "judge the severity"
  assert.deepEqual(deriveDiagnoses({ panic: { ...panic, clinsev_sev: 3 } }), []);
});

test("child criteria: GAD needs 1 symptom, separation anxiety 4 weeks", () => {
  const gadOneSymptom: DipsAnswers = {
    gad: { "1.1": "yes", "1.3": "yes", worries_family_primary: "yes", worries_work_primary: "yes", symptoms_tension_primary: "yes", impact_impair: 5, impact_distress: 5 },
  };
  assert.equal(deriveDiagnoses(gadOneSymptom, { age: 10 }).length, 1);
  assert.deepEqual(deriveDiagnoses(gadOneSymptom, { age: 30 }), []);
  assert.deepEqual(deriveDiagnoses(gadOneSymptom), []); // unknown age → adult thresholds

  const sepFourWeeks: DipsAnswers = {
    sep: {
      "1.1": "yes",
      symptoms_sep1_primary: "yes", symptoms_sep2_primary: "yes", symptoms_sep5_primary: "yes",
      "4.1": "yes", // >= 4 weeks, under 6 months
      approp: "no",
      impact_impair: 5, impact_distress: 5,
    },
  };
  assert.equal(deriveDiagnoses(sepFourWeeks, { age: 12 }).length, 1);
  assert.deepEqual(deriveDiagnoses(sepFourWeeks, { age: 30 }), []);
});

test("GAD: three symptoms, at least some of them on the majority of days", () => {
  const withMajority = (r: string, t: string, s: string): DipsAnswers => ({
    gad: { ...GAD_POSITIVE, symptoms_restless_maj: r, symptoms_tension_maj: t, symptoms_sleep_maj: s },
  });
  // One symptom on most days is enough — the others still count toward the three.
  assert.equal(deriveDiagnoses(withMajority("yes", "no", "no")).length, 1);
  assert.deepEqual(deriveDiagnoses(withMajority("no", "no", "no")), []);
  // Two symptoms never reach the adult threshold, whatever their frequency.
  assert.deepEqual(deriveDiagnoses({ gad: { ...GAD_POSITIVE, symptoms_sleep_primary: "no", symptoms_restless_maj: "yes", symptoms_tension_maj: "yes" } }), []);
});

test("GAD needs worry in at least two life domains", () => {
  const oneDomain: DipsAnswers = { gad: { ...GAD_POSITIVE, worries_work_primary: "no" } };
  assert.deepEqual(deriveDiagnoses(oneDomain), []);
  assert.equal(criterion(oneDomain, "gad", "domains")?.met, false);
});

test("social anxiety: avoided or endured with great fear (items 2.1/2.2)", () => {
  assert.equal(deriveDiagnoses({ social: SOCIAL_POSITIVE }).length, 1);
  assert.equal(deriveDiagnoses({ social: { ...SOCIAL_POSITIVE, "2.1": "no", "2.2": "yes" } }).length, 1);
  const neither: DipsAnswers = { social: { ...SOCIAL_POSITIVE, "2.1": "no", "2.2": "no" } };
  assert.deepEqual(deriveDiagnoses(neither), []);
  assert.equal(criterion(neither, "social", "avoidance")?.met, false);
  // Interviews recorded before the two items existed fall back to the checklist.
  assert.equal(deriveDiagnoses({ social: { ...SOCIAL_POSITIVE, "2.1": undefined } }).length, 1);
});

test("social anxiety differential items surface as caveats", () => {
  const caveats = (extra: ModuleAnswers) => evalOf({ social: { ...SOCIAL_POSITIVE, ...extra } }, "social").caveats.length;
  const base = caveats({});
  assert.equal(caveats({ "7": "yes" }), base + 1); // fear of an unexpected attack → agoraphobia?
  assert.equal(caveats({ "11": "yes" }), base + 1); // cultural context
  // Only speaking/performing/exams feared → "performance only" specifier.
  assert.equal(caveats({ grid_party_primary: "no" }), base + 1);
});

// ---- skip logic -------------------------------------------------------------------

test("a positive screen with unanswered follow-ups can no longer submit as 'nicht zutreffend'", () => {
  // Social: 1.1 yes, 1.2/1.3 blank — the module must be INCOMPLETE.
  const social: ModuleAnswers = { "1.1": "yes" };
  assert.equal(moduleComplete(mod("social"), social), false);
  const answers: DipsAnswers = { ...buildDipsAnswers([]), social };
  assert.equal(allComplete(answers), false);
  assert.equal(allComplete(buildDipsAnswers([])), true);
});

test("answers left under a corrected screening question cannot keep a module entered", () => {
  // Interviewer first clicked 1.1 "Nein", answered the lifetime branch, then
  // corrected 1.1 to "Ja" and denied both escape/help items.
  const agora: ModuleAnswers = { "1.1": "yes", "1.2": "no", "1.3": "no", "1.4": "yes", "1.5": "yes", "1.6": "no" };
  assert.equal(mod("agora").enter(agora), false);
  assert.deepEqual(effectiveModule(mod("agora"), agora), { "1.1": "yes", "1.2": "no", "1.3": "no" });
  assert.equal(evalOf({ agora }, "agora").entered, false);

  // Separation anxiety: 6 months affirmed, then the 4-week question corrected to "no".
  const sep: ModuleAnswers = {
    "1.1": "yes", symptoms_sep1_primary: "yes", symptoms_sep2_primary: "yes", symptoms_sep5_primary: "yes",
    "4.1": "no", "4.2": "yes", approp: "no", impact_impair: 5, impact_distress: 5,
  };
  assert.deepEqual(deriveDiagnoses({ sep }), []);
  assert.equal(criterion({ sep }, "sep", "duration")?.met, false);
});

test("hiding a question drops everything behind it, and a 'Nein' row drops its ratings", () => {
  const panic: ModuleAnswers = {
    ...SAMPLE_ANSWERS.panic,
    "3": "no", // no peak within minutes → symptom list, panic-disorder section and tail are skipped
  };
  const e = effectiveModule(mod("panic"), panic);
  assert.deepEqual(Object.keys(e).sort(), ["1.1", "1.1_text", "2.1", "2.2", "2.2_unexpected", "3"]);
  assert.equal(moduleComplete(mod("panic"), panic), true);
  assert.equal(evalOf({ panic }, "panic").met, false);

  const row: ModuleAnswers = { ...AGORA_POSITIVE, grid_bus_primary: "no" };
  const eff = effectiveModule(mod("agora"), row);
  assert.equal(eff.grid_bus_sev, undefined);
  assert.equal(eff.grid_bus_avoid, undefined);
  // Untouched answers come back by reference — nothing is rebuilt needlessly.
  assert.equal(effectiveModule(mod("agora"), AGORA_POSITIVE), AGORA_POSITIVE);
});

test("the FHIR export carries only what the interview stands on", () => {
  const stale: DipsAnswers = { agora: { "1.1": "yes", "1.2": "no", "1.3": "no", "1.4": "yes", "1.5": "yes" } };
  const fhir = toFHIR({ id: "p", name: "P", demographics: {} }, { answers: stale, lang: "de", completedAt: "2026-01-01T00:00:00.000Z" });
  const agora = fhir.item.find((i) => i.linkId === "agora")!;
  assert.deepEqual(agora.item!.map((i) => i.linkId), ["1.1", "1.2", "1.3"]);
});

test("checklists are required: a symptom list cannot be left blank", () => {
  const panic: ModuleAnswers = { "1.1": "yes", "2.2": "yes", "3": "yes" };
  assert.equal(moduleComplete(mod("panic"), panic), false);
  // Free-text rows ("Andere", the two animal slots) may stay untouched …
  const phobia = buildDipsAnswers(["phobia"]).phobia;
  assert.equal(phobia.grid_animal2_primary, undefined);
  assert.equal(moduleComplete(mod("phobia"), phobia), true);
  // … but a ticked situation needs its starred avoidance answer.
  assert.equal(moduleComplete(mod("phobia"), { ...phobia, grid_heights_primary: "yes" }), false);
  assert.equal(moduleComplete(mod("phobia"), { ...phobia, grid_heights_primary: "yes", grid_heights_avoid: "no" }), true);
});

test("follow-ups appear only on the answer that calls for them", () => {
  const visible = (id: string, itemId: string, m: ModuleAnswers) =>
    isVisible(mod(id).sections.flatMap((s) => s.items).find((it) => it.id === itemId)!, m);
  // "Gab es jemals …" is not asked once the current question is affirmed.
  assert.equal(visible("panic", "1.2", { "1.1": "yes" }), false);
  assert.equal(visible("panic", "1.2", { "1.1": "no" }), true);
  // Causation is only asked when a substance was taken.
  const panic = SAMPLE_ANSWERS.panic;
  assert.equal(visible("panic", "subst2", panic), false);
  assert.equal(visible("panic", "subst2", { ...panic, subst1: "yes" }), true);
  assert.equal(moduleComplete(mod("panic"), { ...panic, subst1: "yes" }), false); // starred in the panic section
  // "Only endured with great fear?" follows a "Nein" to avoidance.
  const social = buildDipsAnswers(["social"]).social;
  assert.equal(visible("social", "2.2", social), false);
  assert.equal(visible("social", "2.2", { ...social, "2.1": "no" }), true);
});

// ---- schema ↔ official numbering ---------------------------------------------------

test("every required item carries its DIPS item number, in ascending order per module", () => {
  for (const m of MODULES) {
    const items = m.sections.flatMap((s) => s.items);
    assert.deepEqual(items.filter((it) => it.req && !it.code).map((it) => `${m.id}.${it.id}`), []);
    assert.equal(new Set(items.map((it) => it.id)).size, items.length, `${m.id}: duplicate item id`);
    // The one non-DIPS item (separation anxiety, 4 weeks for minors) is coded "KJ".
    const codes = items.filter((it) => it.code && it.code !== "KJ").map((it) => it.code!.split(".").map(Number));
    const sorted = [...codes].sort((a, b) => a[0] - b[0] || (a[1] ?? -1) - (b[1] ?? -1));
    assert.deepEqual(codes, sorted, `${m.id}: items out of order`);
  }
});

test("starred tail items follow the module's section of the DIPS", () => {
  const required = (id: string, itemId: string) => !!mod(id).sections.flatMap((s) => s.items).find((it) => it.id === itemId)?.req;
  // Substance rule-out: starred for panic, social anxiety and GAD only.
  assert.deepEqual(["panic", "agora", "social", "phobia", "gad", "sep"].filter((id) => required(id, "subst1")), ["panic", "social", "gad"]);
  // Impairment/distress: starred everywhere except the panic section.
  assert.deepEqual(MODULES.filter((m) => required(m.id, "impact")).map((m) => m.id), ["agora", "social", "phobia", "gad", "sep"]);
  // Appropriateness: the four phobic/separation sections.
  assert.deepEqual(MODULES.filter((m) => required(m.id, "approp")).map((m) => m.id), ["agora", "social", "phobia", "sep"]);
});

// ---- submission validation ---------------------------------------------------------

test("submissions are validated against the schema", () => {
  const ok = validateDipsSubmission(buildDipsAnswers(["panic"]));
  assert.equal(ok.ok, true);

  const bad = (answers: unknown) => {
    const r = validateDipsSubmission(answers);
    return r.ok ? "ok" : r.error;
  };
  assert.equal(bad(null), "invalid_answers");
  assert.equal(bad({ ...buildDipsAnswers([]), panic: { "1.1": "maybe", "1.2": "no" } }), "invalid_answers");
  assert.equal(bad({ ...buildDipsAnswers([]), panic: { "1.1": "no", "1.2": "no", injected: "x" } }), "invalid_answers");
  assert.equal(bad({ ...buildDipsAnswers(["gad"]), gad: { ...buildDipsAnswers(["gad"]).gad, impact_impair: 9 } }), "invalid_answers");
  assert.equal(bad({ ...buildDipsAnswers(["gad"]), gad: { ...buildDipsAnswers(["gad"]).gad, "5": "140" } }), "dips_incomplete"); // > 100 %
  assert.equal(bad({ panic: { "1.1": "no", "1.2": "no" } }), "dips_incomplete"); // five modules never screened

  // Answers under skipped questions are stripped, not stored.
  const stale = validateDipsSubmission({ ...buildDipsAnswers([]), panic: { "1.1": "no", "1.2": "no", "3": "yes" } });
  assert.deepEqual(stale.ok && stale.answers.panic, { "1.1": "no", "1.2": "no" });
});
