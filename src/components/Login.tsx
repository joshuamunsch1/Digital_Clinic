"use client";
import React from "react";
import { C } from "@/lib/theme";
import type { LoginRoster, PatientStatus, Role } from "@/lib/types";
import { Card, LeafMark } from "./ui";

export function Login({ roster, onLogin, busy }: { roster: LoginRoster; onLogin: (role: Role, id: string) => void; busy?: boolean }) {
  const statusHint: Record<PatientStatus, string> = {
    assessment: "new — intake (DIPS) due",
    interview: "DIPS done — awaiting interview",
    therapy: "in therapy",
  };
  const cols: { role: Role; title: string; sub: string; users: { id: string; name: string; hint: string }[] }[] = [
    { role: "patient", title: "Patient", sub: "Complete your questionnaires", users: roster.patients.map((p) => ({ id: p.id, name: p.name, hint: statusHint[p.status] })) },
    { role: "therapist", title: "Therapist", sub: "Follow your patients' development", users: roster.therapists.map((t) => ({ id: t.id, name: t.name, hint: t.title })) },
    { role: "director", title: "Clinic director", sub: "Oversee patients, therapists & assignments", users: roster.directors.map((d) => ({ id: d.id, name: d.name, hint: d.title })) },
  ];
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: C.bg }}>
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3"><LeafMark size={40} /><h1 className="lc-display text-4xl" style={{ color: C.ink }}>Volksklinik</h1></div>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>Therapy progress platform · prototype with demo data — choose a role to sign in</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {cols.map((c) => (
            <Card key={c.role} className="p-4">
              <h2 className="lc-display text-xl" style={{ color: C.spruce }}>{c.title}</h2>
              <p className="text-xs mb-3 mt-0.5" style={{ color: C.muted }}>{c.sub}</p>
              <div className="flex flex-col gap-2" style={{ maxHeight: 280, overflowY: "auto" }}>
                {c.users.length === 0 && <p className="text-xs" style={{ color: C.muted }}>No accounts found — run <code>npm run db:seed</code>.</p>}
                {c.users.map((u) => (
                  <button key={u.id} type="button" disabled={busy} onClick={() => onLogin(c.role, u.id)} className="text-left rounded-lg px-3 py-2" style={{ background: C.surfaceAlt, border: `1px solid ${C.line}`, opacity: busy ? 0.6 : 1 }}>
                    <span className="block text-sm font-semibold" style={{ color: C.ink }}>{u.name}</span>
                    <span className="block text-xs" style={{ color: C.muted }}>{u.hint}</span>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <p className="text-center text-xs mt-6" style={{ color: C.muted }}>Mock sign-in for prototyping. A production version needs real authentication, encryption and GDPR/revDSG-compliant handling of health data.</p>
      </div>
    </div>
  );
}