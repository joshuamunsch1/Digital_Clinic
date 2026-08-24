// Rule-based DIPS diagnosis derivation (src/lib/dips/diagnosis.ts) — pure, no DB.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveDiagnoses, evaluateDips, primaryProposal } from "../src/lib/dips/diagnosis";
import { MODULES } from "../src/lib/dips/schema";
import { allComplete, moduleComplete } from "../src/lib/dips/engine";
import { DEMO_PATIENTS, SAMPLE_ANSWERS, buildDipsAnswers } from "../src/lib/demo";
import type { DipsAnswers, ModuleAnswers } from "../src/lib/types";

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
  const gadEval = evaluateDips(sub).find((e) => e.moduleId === "gad")!;
  assert.equal(gadEval.entered, true); // screened positive, criteria not met
  assert.equal(gadEval.criteria.find((c) => c.key === "impact")?.met, false);
});

test("organic/substance answers become caveats, not blocks", () => {
  const withOrganic: DipsAnswers = {
    panic: { ...SAMPLE_ANSWERS.panic, organic: "yes", organic_text: "Schilddrüse" },
  };
  const met = deriveDiagnoses(withOrganic);
  assert.equal(met.length, 1);
  assert.ok(met[0].caveats.length >= 1);
});

test("agoraphobia alongside panic codes F40.01; alone F40.00", () => {
  const agora: ModuleAnswers = {
    "1.1": "yes",
    "1.2": "yes",
    // two of five situation categories at clinical level
    grid_bus_primary: "yes", grid_bus_sev: 3, grid_bus_avoid: "yes", // transport
    grid_crowd_primary: "yes", grid_crowd_sev: 2, // crowds
    "4": "yes", // almost every time (DSM-5 criterion C)
    dur6: "yes",
    impact_impair: 5,
    impact_distress: 6,
  };
  const combined = deriveDiagnoses({ panic: SAMPLE_ANSWERS.panic, agora });
  const agoraEval = combined.find((e) => e.moduleId === "agora")!;
  assert.equal(agoraEval.icdCode, "F40.01");
  assert.match(agoraEval.suggestedText, /F40\.01/);

  const alone = deriveDiagnoses({ agora });
  assert.equal(alone.length, 1);
  assert.equal(alone[0].icdCode, "F40.00");
});

test("agoraphobia requires two situation CATEGORIES, not two rows in one", () => {
  const oneCategory: ModuleAnswers = {
    "1.1": "yes",
    "1.2": "yes",
    grid_bus_primary: "yes", grid_bus_sev: 3,
    grid_train_primary: "yes", grid_train_sev: 3, // same transport category
    dur6: "yes",
    impact_impair: 6,
    impact_distress: 6,
  };
  assert.deepEqual(deriveDiagnoses({ agora: oneCategory }), []);
});

test("demo DIPS profiles derive the diagnoses the seed records", () => {
  // p3 Elif — GAD F41.1; p6/p10 — social F40.1; p7 — specific phobia F40.2
  assert.equal(primaryProposal(buildDipsAnswers(["gad"]))?.icdCode, "F41.1");
  assert.equal(primaryProposal(buildDipsAnswers(["social"]))?.icdCode, "F40.1");
  assert.equal(primaryProposal(buildDipsAnswers(["phobia"]))?.icdCode, "F40.2");
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

test("every demo patient carries a DIPS interview profile", () => {
  assert.equal(DEMO_PATIENTS.length, 12);
  assert.ok(DEMO_PATIENTS.every((p) => p.dips && p.dips.completedAt));
});

test("primaryProposal picks the highest-impact met module", () => {
  const social: ModuleAnswers = {
    "1.1": "yes", "1.2": "yes",
    grid_speak_primary: "yes", grid_speak_sev: 3, grid_speak_avoid: "yes",
    "6": "yes", "4.2": "yes",
    impact_impair: 8, impact_distress: 8,
  };
  const primary = primaryProposal({ panic: SAMPLE_ANSWERS.panic, social });
  assert.equal(primary?.diagnosis, "social_anxiety"); // 16 > 13
});

// ---- 2026-08-24 rule fixes ------------------------------------------------------

test("lifetime-only answers never produce a current diagnosis proposal", () => {
  // No current attacks, one phase years ago with a month of worry: the old
  // engine proposed a present-tense "Panikstörung (F41.0)" from this.
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
});

test("clinician severity rating takes precedence over patient impact", () => {
  const base: ModuleAnswers = {
    "1.1": "yes", "1.3": "yes",
    symptoms_restless_primary: "yes", symptoms_tension_primary: "yes", symptoms_sleep_primary: "yes",
    impact_impair: 6, impact_distress: 6,
  };
  // Interviewer rates severity 2 (< 4): blocks despite high patient ratings.
  assert.deepEqual(deriveDiagnoses({ gad: { ...base, clinsev_sev: 2 } }), []);
  // Interviewer rates 5: proposal stands even with low patient ratings.
  const met = deriveDiagnoses({ gad: { ...base, impact_impair: 1, impact_distress: 1, clinsev_sev: 5 } });
  assert.equal(met.length, 1);
});

test("child criteria: GAD needs 1 symptom, separation anxiety 4 weeks", () => {
  const gadOneSymptom: DipsAnswers = {
    gad: { "1.1": "yes", "1.3": "yes", symptoms_tension_primary: "yes", impact_impair: 5, impact_distress: 5 },
  };
  assert.equal(deriveDiagnoses(gadOneSymptom, { age: 10 }).length, 1);
  assert.deepEqual(deriveDiagnoses(gadOneSymptom, { age: 30 }), []);
  assert.deepEqual(deriveDiagnoses(gadOneSymptom), []); // unknown age → adult thresholds

  const sepFourWeeks: DipsAnswers = {
    sep: {
      "1.1": "yes",
      symptoms_sep1_primary: "yes", symptoms_sep2_primary: "yes", symptoms_sep5_primary: "yes",
      "4.1": "yes", // >= 4 weeks, under 6 months
      impact_impair: 5, impact_distress: 5,
    },
  };
  assert.equal(deriveDiagnoses(sepFourWeeks, { age: 12 }).length, 1);
  assert.deepEqual(deriveDiagnoses(sepFourWeeks, { age: 30 }), []);
});

test("GAD symptoms explicitly denied for the majority of days do not count", () => {
  const answers: DipsAnswers = {
    gad: {
      "1.1": "yes", "1.3": "yes",
      symptoms_restless_primary: "yes", symptoms_restless_maj: "no",
      symptoms_tension_primary: "yes", symptoms_sleep_primary: "yes",
      impact_impair: 5, impact_distress: 5,
    },
  };
  assert.deepEqual(deriveDiagnoses(answers), []); // only 2 of 3 count
});

test("'alone at home' is not one of the five DSM-5 agoraphobia categories", () => {
  const answers: DipsAnswers = {
    agora: {
      "1.1": "yes", "1.2": "yes", "4": "yes", dur6: "yes",
      grid_alonehome_primary: "yes", grid_alonehome_sev: 3, grid_alonehome_avoid: "yes",
      grid_bus_primary: "yes", grid_bus_sev: 3, // transport — 1 core category
      impact_impair: 5, impact_distress: 5,
    },
  };
  const e = evaluateDips(answers).find((x) => x.moduleId === "agora")!;
  assert.equal(e.criteria.find((c) => c.key === "situations")?.met, false);
});

test("a positive screen with unanswered follow-ups can no longer submit as 'nicht zutreffend'", () => {
  // Social: 1.1 yes, 1.2/1.3 blank — the module must be INCOMPLETE now (the
  // old req flags let this submit and display as not-applicable).
  const social: ModuleAnswers = { "1.1": "yes" };
  const mod = MODULES.find((m) => m.id === "social")!;
  assert.equal(moduleComplete(mod, social), false);
  const answers: DipsAnswers = {
    panic: { "1.1": "no", "1.2": "no" },
    agora: { "1.1": "no", "1.4": "no" },
    social,
    phobia: { "1.1": "no", "1.2": "no" },
    gad: { "1.1": "no" },
    sep: { "1.1": "no", "1.3": "no" },
  };
  assert.equal(allComplete(answers), false);
});
