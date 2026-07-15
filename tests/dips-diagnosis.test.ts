// Rule-based DIPS diagnosis derivation (src/lib/dips/diagnosis.ts) — pure, no DB.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveDiagnoses, evaluateDips, primaryProposal } from "../src/lib/dips/diagnosis";
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
  // p11 Rahel — panic + agoraphobia; the agora module codes F40.01 alongside panic
  const met = deriveDiagnoses(buildDipsAnswers(["panic", "agora"]));
  assert.deepEqual(met.map((e) => e.icdCode).sort(), ["F40.01", "F41.0"]);
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
