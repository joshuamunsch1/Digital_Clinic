// Pure session-number suggestion logic (src/lib/session-numbers.ts) — no DB.
import assert from "node:assert/strict";
import { test } from "node:test";
import { maxKnownSessionNumber, suggestNextSessionNumber } from "../src/lib/session-numbers";

const empty = { sessionLogs: [], responses: [], invitations: [] };
const log = (type: string, sessionNumber: number | null) => ({ type, sessionNumber });
const resp = (sessionNumber: number | null) => ({ sessionNumber });
const inv = (status: string, sessionNumber?: number) => ({ status, context: { sessionNumber } });

test("empty patient: nothing known, suggestion is 1 (0 = baseline)", () => {
  assert.equal(maxKnownSessionNumber(empty), null);
  assert.equal(suggestNextSessionNumber(empty), 1);
});

test("transition patient: responses-only history drives the suggestion", () => {
  const p = { ...empty, responses: [resp(0), resp(1), resp(8), resp(null)] };
  assert.equal(suggestNextSessionNumber(p), 9);
});

test("held ledger entries count; cancellations/no-shows never do", () => {
  const p = { ...empty, sessionLogs: [log("held", 5), log("cancelled", 9), log("no_show", 9), log("held", null)] };
  assert.equal(suggestNextSessionNumber(p), 6);
});

test("open invitation context reserves its session number", () => {
  const p = { ...empty, responses: [resp(9)], invitations: [inv("created", 10)] };
  assert.equal(suggestNextSessionNumber(p), 11);
});

test("terminal invitations (cancelled/no_response/error/completed) are ignored", () => {
  for (const status of ["cancelled", "no_response", "error", "completed"]) {
    const p = { ...empty, responses: [resp(4)], invitations: [inv(status, 10)] };
    assert.equal(suggestNextSessionNumber(p), 5, status);
  }
});

test("invitations without a session number in context are inert", () => {
  const p = { ...empty, invitations: [inv("invited"), inv("created")] };
  assert.equal(suggestNextSessionNumber(p), 1);
});

test("mixed sources: the maximum across all three wins", () => {
  const p = {
    sessionLogs: [log("held", 7)],
    responses: [resp(6), resp(0)],
    invitations: [inv("invited", 8), inv("cancelled", 12)],
  };
  assert.equal(maxKnownSessionNumber(p), 8);
  assert.equal(suggestNextSessionNumber(p), 9);
});
