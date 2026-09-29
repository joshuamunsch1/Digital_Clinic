"use client";
// Director-only intern account management (Batch 16): create Praktikant:innen
// logins for paper-questionnaire entry, deactivate them when the internship
// ends, reset a forgotten password. Folded by default — a low-frequency task.
import React, { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { api, type InternAccount } from "@/lib/api-client";
import { CollapsibleCard, Field, GhostButton, PrimaryButton, inputStyle } from "./ui";
import { useT } from "./LangContext";

export function StaffInternsCard() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [interns, setInterns] = useState<InternAccount[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.listInterns().then((r) => setInterns(r.interns)).catch(() => setInterns([]));
  }, []);

  const errText = (m: string) =>
    m === "email_taken" ? t("emailTaken") : m === "invalid_email" ? t("invalidEmail") : m === "weak_password" ? t("passwordTooShort") : m === "missing_fields" ? t("internMissingFields") : m;

  const run = async (fn: () => Promise<{ interns: InternAccount[] }>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setInterns(r.interns);
      setMsg(done);
      return true;
    } catch (e) {
      setMsg(`✗ ${errText((e as Error).message)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const active = interns?.filter((i) => i.active).length ?? 0;
  return (
    <CollapsibleCard id="staff-interns" title={t("internsTitle")} open={open} onToggle={() => setOpen(!open)}
      summary={interns ? t("internsSummary", { active, total: interns.length }) : t("loading")}>
      <p className="text-xs mb-3" style={{ color: C.muted }}>{t("internsSub")}</p>
      <div className="flex flex-col gap-1.5 mb-4">
        {(interns ?? []).map((u) => (
          <div key={u.id} className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2 text-xs"
            style={{ background: C.surfaceAlt, opacity: u.active ? 1 : 0.6 }}>
            <span className="font-semibold" style={{ color: C.ink }}>{u.name}</span>
            <span style={{ color: C.muted }}>{u.email}</span>
            <span style={{ color: C.muted }}>{t("internsSince", { date: fmtDate(u.createdAt) })}</span>
            <span style={{ color: C.muted }}>{t("internsEntries", { n: u.entries30d })}</span>
            <span className="font-semibold px-2 py-0.5 rounded-full"
              style={{ background: u.active ? C.spruceSoft : C.surface, color: u.active ? C.spruce : C.muted }}>
              {u.active ? t("internActive") : t("internInactive")}
            </span>
            <span className="ml-auto flex gap-2">
              <GhostButton small disabled={busy} onClick={() => {
                const pw = window.prompt(t("internNewPasswordPrompt"));
                if (pw) void run(() => api.updateIntern({ id: u.id, password: pw }), t("internPasswordReset"));
              }}>{t("internResetPassword")}</GhostButton>
              <GhostButton small disabled={busy} onClick={() => void run(() => api.updateIntern({ id: u.id, active: !u.active }), u.active ? t("internDeactivated") : t("internReactivated"))}>
                {u.active ? t("internDeactivate") : t("internReactivate")}
              </GhostButton>
            </span>
          </div>
        ))}
        {interns && interns.length === 0 && <p className="text-xs" style={{ color: C.muted }}>{t("internsNone")}</p>}
      </div>
      <p className="text-xs font-bold mb-2" style={{ color: C.muted }}>{t("internCreate")}</p>
      <div className="flex items-end gap-2 flex-wrap">
        <Field label={t("fullName")}><input style={{ ...inputStyle, width: 180 }} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("email")}><input style={{ ...inputStyle, width: 220 }} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t("internInitialPassword")}><input type="text" style={{ ...inputStyle, width: 160 }} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
        <PrimaryButton small disabled={busy || !name.trim() || !email.trim() || password.length < 8} onClick={async () => {
          if (await run(() => api.createIntern({ name: name.trim(), email: email.trim(), password }), t("internCreated"))) {
            setName("");
            setEmail("");
            setPassword("");
          }
        }}>{t("internCreate")}</PrimaryButton>
      </div>
      {msg && <p className="text-xs mt-2" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </CollapsibleCard>
  );
}
