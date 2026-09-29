import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  channelProblem,
  defaultChannel,
  defaultPlanItems,
  dueIntervalItems,
  intervalStatus,
  lastActivityAt,
  sessionDispatchItems,
} from "../src/lib/measurement-plan";
import type { InstrumentDef, ItemDef } from "../src/lib/instruments/types";
import type { Patient, PlanItemRecord } from "../src/lib/types";

const item = (id: string, text?: string): ItemDef => ({ id, label: id, text, responseType: "likert", min: 0, max: 3 });
const inst = (over: Partial<InstrumentDef> & { id: string }): InstrumentDef => ({
  name: over.id,
  abbreviation: over.id.toUpperCase(),
  population: "adult",
  raterRole: "self",
  instrumentType: "likert_battery",
  cadenceType: "periodic",
  cadenceConfig: {},
  definitionStatus: "complete",
  items: [item("a", "Wording")],
  scales: [],
  sourceNotes: "",
  ...over,
});

const phq4 = inst({ id: "phq4", cadenceType: "every_session", population: "adult_adolescent" });
const pstb = inst({ id: "pstb_adult", cadenceType: "every_session" });
const sbkj = inst({ id: "sbkj_child", cadenceType: "every_session", population: "child_adolescent_8_17" });
const bdi = inst({ id: "bdi_fs", items: [item("BDI1")] }); // licensed: no wording
const bdiLinked = { ...bdi, limesurveySurveyId: "123" };
const partial = inst({ id: "bsi", definitionStatus: "partial" });

const patient = (age: number): Patient =>
  ({ id: "p", demographics: { age }, responses: [], invitations: [] }) as unknown as Patient;

const plan = (over: Partial<PlanItemRecord>): PlanItemRecord => ({
  id: "i",
  instrumentId: "bdi_fs",
  respondentRole: "self",
  rhythm: "interval",
  intervalDays: 14,
  channel: "in_app",
  remindEveryDays: null,
  maxReminders: null,
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

const NOW = new Date("2026-03-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString();

describe("channels", () => {
  it("in-app needs full wording, LimeSurvey a configured + linked survey", () => {
    assert.equal(channelProblem(phq4, "in_app", false), null);
    assert.equal(channelProblem(bdi, "in_app", true), "no_wording");
    assert.equal(channelProblem(bdi, "limesurvey", false), "ls_unconfigured");
    assert.equal(channelProblem(bdi, "limesurvey", true), "ls_unlinked");
    assert.equal(channelProblem(bdiLinked, "limesurvey", true), null);
    assert.equal(channelProblem(bdi, "paper", false), null);
    assert.equal(channelProblem(partial, "paper", true), "not_fillable");
  });
  it("prefers in-app, then LimeSurvey, then paper", () => {
    assert.equal(defaultChannel(phq4, true), "in_app");
    assert.equal(defaultChannel(bdiLinked, true), "limesurvey");
    assert.equal(defaultChannel(bdi, true), "paper");
  });
});

describe("default plan", () => {
  it("holds the age-matched every-session instruments", () => {
    const all = [phq4, pstb, sbkj, bdi];
    assert.deepEqual(defaultPlanItems(patient(30), all, false).map((i) => i.instrumentId), ["phq4", "pstb_adult"]);
    assert.deepEqual(defaultPlanItems(patient(12), all, false).map((i) => i.instrumentId), ["phq4", "sbkj_child"]);
    assert.ok(defaultPlanItems(patient(30), all, false).every((i) => i.rhythm === "every_session" && i.channel === "in_app"));
  });
});

describe("session dispatch", () => {
  it("sends active every-session items except paper", () => {
    const items = [
      plan({ id: "1", instrumentId: "phq4", rhythm: "every_session", intervalDays: null }),
      plan({ id: "2", instrumentId: "bdi_fs", rhythm: "every_session", intervalDays: null, channel: "paper" }),
      plan({ id: "3", instrumentId: "pstb_adult", rhythm: "every_session", intervalDays: null, active: false }),
      plan({ id: "4" }),
    ];
    assert.deepEqual(sessionDispatchItems(items).map((i) => i.id), ["1"]);
  });
});

describe("interval scheduling", () => {
  const item14 = plan({});
  it("is due immediately when never measured", () => {
    assert.deepEqual(intervalStatus(item14, [], [], NOW), { dueAt: null, due: true, waiting: false });
  });
  it("waits intervalDays after the last response or request", () => {
    const responses = [{ instrumentId: "bdi_fs", respondentRole: "self", occurredAt: daysAgo(10) }];
    const st = intervalStatus(item14, [], responses, NOW);
    assert.equal(st.due, false);
    assert.equal(st.dueAt, NOW.getTime() + 4 * 864e5);
    const old = [{ instrumentId: "bdi_fs", respondentRole: "self", occurredAt: daysAgo(15) }];
    assert.equal(intervalStatus(item14, [], old, NOW).due, true);
  });
  it("never stacks: an open request blocks the next send", () => {
    const open = [{ instrumentId: "bdi_fs", respondentRole: "self", status: "created", createdAt: daysAgo(30) }];
    assert.deepEqual(intervalStatus(item14, open, [], NOW), { dueAt: null, due: false, waiting: true });
  });
  it("counts cancelled and errored requests as activity (no re-send loop)", () => {
    const err = [{ instrumentId: "bdi_fs", respondentRole: "self", status: "error", createdAt: daysAgo(1) }];
    assert.equal(lastActivityAt(item14, err, []), Date.parse(daysAgo(1)));
    assert.equal(intervalStatus(item14, err, [], NOW).due, false);
  });
  it("ignores other instruments and raters", () => {
    const responses = [
      { instrumentId: "phq4", respondentRole: "self", occurredAt: daysAgo(1) },
      { instrumentId: "bdi_fs", respondentRole: "mother", occurredAt: daysAgo(1) },
    ];
    assert.equal(lastActivityAt(item14, [], responses), null);
  });
  it("sweeps only due, active, non-paper interval items", () => {
    const items = [
      plan({ id: "due" }),
      plan({ id: "paper", instrumentId: "x", channel: "paper" }),
      plan({ id: "paused", instrumentId: "y", active: false }),
      plan({ id: "session", instrumentId: "z", rhythm: "every_session", intervalDays: null }),
    ];
    assert.deepEqual(dueIntervalItems(items, [], [], NOW).map((i) => i.id), ["due"]);
  });
});
