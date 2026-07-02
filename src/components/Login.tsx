"use client";
// Public entry: e-mail + password sign-in for everyone, and an inviting
// self-registration flow for new patients (reachable from any network — only
// staff *data access* is network-restricted).
import React, { useState } from "react";
import { C } from "@/lib/theme";
import { T, tr } from "@/lib/i18n";
import type { Demographics } from "@/lib/types";
import { Card, Field, GhostButton, LeafMark, PrimaryButton, inputStyle } from "./ui";
import { LangSwitcher, useLang, useT } from "./LangContext";

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  demographics: Demographics;
}

const DEMO_ACCOUNTS: { role: string; email: string; password: string }[] = [
  { role: "roleDirector", email: "margrit.steiner@linden-clinic.ch", password: "director2026" },
  { role: "roleAdmin", email: "kurt.iseli@linden-clinic.ch", password: "admin2026" },
  { role: "roleTherapist", email: "anna.keller@linden-clinic.ch", password: "therapist2026" },
  { role: "rolePatient", email: "mara.vogel@example.org", password: "patient2026" },
];

function errorText(msg: string, t: ReturnType<typeof useT>): string {
  switch (msg) {
    case "invalid_credentials": return t("invalidCredentials");
    case "email_taken": return t("emailTaken");
    case "weak_password": return t("passwordTooShort");
    case "network_restricted": return t("networkRestricted");
    default: return msg;
  }
}

export function Login({ onLogin, onRegister, busy }: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (payload: RegisterPayload) => Promise<void>;
  busy: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const [view, setView] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  // registration state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regPw2, setRegPw2] = useState("");
  const [demo, setDemo] = useState<Demographics>({});
  const setD = (k: keyof Demographics, v: string) => setDemo((prev) => ({ ...prev, [k]: v }));

  const doLogin = async () => {
    setError(null);
    try {
      await onLogin(email.trim(), password);
    } catch (e) {
      setError(errorText((e as Error).message, t));
    }
  };

  const doRegister = async () => {
    setError(null);
    if (regPw.length < 8) { setError(t("passwordTooShort")); return; }
    if (regPw !== regPw2) { setError(t("passwordMismatch")); return; }
    try {
      await onRegister({ name: regName.trim(), email: regEmail.trim(), password: regPw, demographics: demo });
    } catch (e) {
      setError(errorText((e as Error).message, t));
    }
  };

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: C.bg }}>
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <LeafMark size={40} />
            <div>
              <h1 className="lc-display text-3xl" style={{ color: C.ink }}>Volksklinik</h1>
              <p className="text-sm" style={{ color: C.muted }}>{t("appTagline")}</p>
            </div>
          </div>
          <LangSwitcher compact />
        </div>

        {view === "login" ? (
          <Card className="p-6">
            <p className="text-sm mb-4" style={{ color: C.muted }}>{t("loginLead")}</p>
            <form onSubmit={(e) => { e.preventDefault(); void doLogin(); }} className="flex flex-col gap-3">
              <Field label={t("email")}>
                <input style={inputStyle} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t("password")}>
                <input style={inputStyle} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {error && <p className="text-sm" style={{ color: C.danger }}>{error}</p>}
              <PrimaryButton disabled={busy || !email.trim() || !password} submit>
                {busy ? t("signingIn") : t("signIn")}
              </PrimaryButton>
            </form>
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
              <button type="button" onClick={() => { setView("register"); setError(null); }} className="text-sm font-semibold" style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                {t("registerCta")} →
              </button>
            </div>
            <div className="mt-4">
              <button type="button" onClick={() => setShowDemo(!showDemo)} className="text-xs" style={{ color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                {t("demoAccounts")} {showDemo ? "▲" : "▼"}
              </button>
              {showDemo && (
                <table className="text-xs mt-2 w-full" style={{ borderCollapse: "collapse" }}>
                  <tbody>
                    {DEMO_ACCOUNTS.map((a) => (
                      <tr key={a.email} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td className="py-1 pr-2 font-semibold" style={{ color: C.ink }}>{t(a.role as Parameters<typeof t>[0])}</td>
                        <td className="py-1 pr-2" style={{ color: C.muted }}>
                          <button type="button" onClick={() => { setEmail(a.email); setPassword(a.password); }} style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}>
                            {a.email}
                          </button>
                        </td>
                        <td className="py-1" style={{ color: C.muted, fontFamily: "monospace" }}>{a.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <h2 className="lc-display text-xl mb-1" style={{ color: C.ink }}>{t("registerTitle")}</h2>
            <p className="text-sm mb-4" style={{ color: C.muted }}>{t("registerIntro")}</p>
            <form onSubmit={(e) => { e.preventDefault(); void doRegister(); }} className="flex flex-col gap-3">
              <Field label={`${t("fullName")} *`}>
                <input style={inputStyle} autoComplete="name" value={regName} onChange={(e) => setRegName(e.target.value)} />
              </Field>
              <Field label={`${t("email")} *`}>
                <input style={inputStyle} type="email" autoComplete="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`${t("password")} *`}>
                  <input style={inputStyle} type="password" autoComplete="new-password" value={regPw} onChange={(e) => setRegPw(e.target.value)} />
                </Field>
                <Field label={`${t("passwordRepeat")} *`}>
                  <input style={inputStyle} type="password" autoComplete="new-password" value={regPw2} onChange={(e) => setRegPw2(e.target.value)} />
                </Field>
              </div>

              <p className="text-sm font-semibold mt-2" style={{ color: C.spruce }}>{t("aboutYou")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={tr(T.age, lang)}>
                  <input style={inputStyle} inputMode="numeric" value={String(demo.age ?? "")} onChange={(e) => setD("age", e.target.value)} />
                </Field>
                <Field label={tr(T.sex, lang)}>
                  <select style={inputStyle} value={demo.sex ?? ""} onChange={(e) => setD("sex", e.target.value)}>
                    <option value="">{tr(T.select, lang)}</option>
                    {T.sexOpts.map((o) => { const v = tr(o, "en"); return <option key={v} value={v}>{tr(o, lang)}</option>; })}
                  </select>
                </Field>
                <Field label={tr(T.nationality, lang)}>
                  <input style={inputStyle} value={demo.nationality ?? ""} onChange={(e) => setD("nationality", e.target.value)} />
                </Field>
                <Field label={tr(T.city, lang)}>
                  <input style={inputStyle} value={demo.city ?? ""} onChange={(e) => setD("city", e.target.value)} />
                </Field>
                <Field label={tr(T.occupation, lang)}>
                  <input style={inputStyle} value={demo.occupation ?? ""} onChange={(e) => setD("occupation", e.target.value)} />
                </Field>
                <Field label={tr(T.living, lang)}>
                  <select style={inputStyle} value={demo.living ?? ""} onChange={(e) => setD("living", e.target.value)}>
                    <option value="">{tr(T.select, lang)}</option>
                    {T.livingOpts.map((o) => { const v = tr(o, "en"); return <option key={v} value={v}>{tr(o, lang)}</option>; })}
                  </select>
                </Field>
              </div>

              {error && <p className="text-sm" style={{ color: C.danger }}>{error}</p>}
              <div className="flex gap-3 items-center mt-1">
                <PrimaryButton disabled={busy || !regName.trim() || !regEmail.trim() || !regPw || !regPw2} submit>
                  {busy ? t("creatingAccount") : t("createAccount")}
                </PrimaryButton>
                <GhostButton onClick={() => { setView("login"); setError(null); }}>{t("backToLogin")}</GhostButton>
              </div>
              <p className="text-xs" style={{ color: C.muted }}>{t("registerPrivacyNote")}</p>
            </form>
          </Card>
        )}

        <p className="text-xs text-center mt-6" style={{ color: C.muted }}>{t("loginFooter")}</p>
      </div>
    </div>
  );
}
