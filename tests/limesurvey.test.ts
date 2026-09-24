import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LimesurveyError, assertMailed } from "../src/lib/limesurvey";

// Result shapes as LimeSurvey 6.17 builds them (emailTokens() in
// helpers/admin/token_helper.php, then remotecontrol_handle.php overwrites the
// top-level status with "N left to send" regardless of the outcome).
const ok = { "7": { name: "Test Patient", email: "t@example.org", status: "OK", warning: null, error: null }, status: "0 left to send" };
const smtpFail = {
  "7": { name: "Test Patient", email: "t@example.org", status: "fail", warning: null, error: "SMTP Error: Could not authenticate." },
  status: "0 left to send",
};

describe("assertMailed", () => {
  it("accepts a per-participant OK", () => {
    assert.doesNotThrow(() => assertMailed("invite_participants", ok, "7"));
  });

  it("throws on a failed send even though the top-level status looks fine", () => {
    assert.throws(
      () => assertMailed("invite_participants", smtpFail, "7"),
      (e: unknown) => e instanceof LimesurveyError && /mail not sent — SMTP Error: Could not authenticate\./.test(e.message),
    );
  });

  it("throws when the participant has no result entry", () => {
    assert.throws(() => assertMailed("remind_participants", { status: "0 left to send" }, "7"), LimesurveyError);
    assert.throws(() => assertMailed("remind_participants", ok, "8"), LimesurveyError);
  });

  it("falls back to the status when LimeSurvey gives no error text", () => {
    const bare = { "7": { status: "fail", error: null }, status: "0 left to send" };
    assert.throws(() => assertMailed("invite_participants", bare, "7"), /mail not sent — fail/);
  });
});
