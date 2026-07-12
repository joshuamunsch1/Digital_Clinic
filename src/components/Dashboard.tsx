"use client";
import React, { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { T, tr, trCategory } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { api, type RegisterPatientPayload } from "@/lib/api-client";
import type { PredictionSummary } from "@/lib/prediction/service";
import type { ClinicData, Demographics, Patient, SessionUser, Therapist } from "@/lib/types";
import {
  DIPS_INSTRUMENT_ID,
  DISORDER_CATEGORIES,
  activeAlerts,
  fmtScore,
  latestSessionScore,
  responsesFor,
} from "@/lib/types";
import { Card, Field, MiniTrend, PrimaryButton, SectionTitle, Stat, StatusBadge, TrendArrow, inputStyle } from "./ui";
import { GlobalChart } from "./charts";
import { archivedPatientsFor } from "./ArchiveView";
import { EarlyChangeBadge } from "./PredictionPanel";
import { useLang, useT } from "./LangContext";

/// Small "SIM" chip marking synthetic demo patients (Patient.simulated).
export function SimChip({ patient }: { patient: Patient }) {
  const t = useT();
  if (!patient.simulated) return null;
  return (
    <span className="text-xs font-bold px-1.5 py-0.5 rounded" title={t("simChipTitle")}
      style={{ background: C.amberSoft, color: C.amber, letterSpacing: 0.5 }}>
      SIM
    </span>
  );
}

export function CategoryChip({ category }: { category: string | null }) {
  const { lang } = useLang();
  if (!category) return null;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: C.blueSoft, color: C.blue }}>
      {trCategory(category, lang)}
    </span>
  );
}

/// One patient row: assignment controls for director/admin; clinical score +
/// alert marker only for clinical roles (never for admin).
function PatientRow({ p, user, therapists, alertCount, summary, onOpen, onAssign }: {
  p: Patient;
  user: SessionUser;
  therapists: Therapist[];
  alertCount: number;
  summary?: PredictionSummary;
  onOpen?: (id: string) => void;
  onAssign?: (id: string, therapistId: string | null) => void;
}) {
  const t = useT();
  const isAdmin = user.role === "admin";
  const canAssign = (user.role === "director" || isAdmin) && onAssign;
  const therapist = therapists.find((x) => x.id === p.therapistId);
  const last = latestSessionScore(p);
  const clickable = !isAdmin && onOpen;
  const Inner = (
    <>
      <span className="rounded-full shrink-0" style={{ width: 11, height: 11, background: p.color }} />
      <span className="font-semibold text-sm" style={{ color: C.ink, minWidth: 130 }}>{p.name}</span>
      <SimChip patient={p} />
      <StatusBadge status={p.status} />
      <CategoryChip category={p.disorderCategory} />
      {alertCount > 0 && (
        <span className="text-xs font-bold" style={{ color: C.danger }} title={t("clinicalAlert")}>⚠</span>
      )}
      {!isAdmin && summary?.onTrack === "not_on_track" && (
        <span className="text-xs font-bold" style={{ color: C.amber }} title={t("notOnTrack")}>⚑</span>
      )}
      {!isAdmin && summary && <EarlyChangeBadge value={summary.earlyChange} compact />}
      {canAssign ? (
        <select
          style={{ ...inputStyle, width: "auto", minWidth: 170, padding: "4px 8px", fontSize: 12 }}
          value={p.therapistId || ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onAssign!(p.id, e.target.value || null)}
        >
          <option value="">{t("unassigned")}</option>
          {therapists.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
        </select>
      ) : (
        <span className="text-xs" style={{ color: C.muted }}>{therapist ? therapist.name : ""}</span>
      )}
      {!p.therapistId && canAssign && <span className="text-xs font-semibold" style={{ color: C.amber }}>{t("needsAssignment")}</span>}
      <span className="ml-auto text-sm font-bold flex items-center gap-1" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
        {!isAdmin && (last !== null ? <>{fmtScore(last)} <TrendArrow patient={p} /></> : <span style={{ color: C.muted }}>—</span>)}
      </span>
    </>
  );
  const style = { background: C.surfaceAlt, border: `1px solid ${C.line}`, cursor: clickable ? "pointer" : "default" } as const;
  return clickable ? (
    <button type="button" onClick={() => onOpen!(p.id)} className="w-full text-left rounded-lg px-3 py-3 flex items-center gap-3 flex-wrap" style={style}>
      {Inner}
    </button>
  ) : (
    <div className="rounded-lg px-3 py-3 flex items-center gap-3 flex-wrap" style={style}>{Inner}</div>
  );
}

/// Director's all-scores matrix: latest primary-scale value per instrument and
/// patient — the "everything at a glance" replacement for the old single index.
function ScoresMatrix({ patients, data, summaries, onOpenPatient }: {
  patients: Patient[];
  data: ClinicData;
  summaries: Record<string, PredictionSummary>;
  onOpenPatient: (id: string) => void;
}) {
  const t = useT();
  const columns = useMemo(
    () =>
      data.instruments
        .filter((i) => i.id !== DIPS_INSTRUMENT_ID && i.scales.length > 0)
        .map((inst) => ({ inst, primary: inst.scales[0] }))
        .filter(({ inst }) => patients.some((p) => responsesFor(p, inst.id).some((r) => Object.keys(r.scores).length))),
    [data.instruments, patients],
  );
  const rows = patients.filter((p) => p.responses.some((r) => Object.keys(r.scores).length > 0));
  if (!rows.length || !columns.length) return null;
  return (
    <Card className="p-5 mb-5">
      <SectionTitle sub={t("scoresOverviewSub")}>{t("scoresOverview")}</SectionTitle>
      <div className="overflow-x-auto">
        <table className="text-xs w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th className="text-left pr-4 py-2" style={{ color: C.muted, fontWeight: 600 }}>{t("colPatient")}</th>
              {columns.map(({ inst, primary }) => (
                <th key={inst.id} className="text-right px-3 py-2 whitespace-nowrap" style={{ color: C.muted, fontWeight: 600 }} title={`${inst.name} — ${primary.label}`}>
                  {inst.abbreviation}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => onOpenPatient(p.id)} style={{ borderTop: `1px solid ${C.line}`, cursor: "pointer" }}>
                <td className="pr-4 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2 font-semibold" style={{ color: C.ink }}>
                    <span className="rounded-full" style={{ width: 9, height: 9, background: p.color }} />{p.name}
                    <SimChip patient={p} />
                    {summaries[p.id]?.onTrack === "not_on_track" && (
                      <span className="text-xs font-bold" style={{ color: C.amber }} title={t("notOnTrack")}>⚑</span>
                    )}
                    {summaries[p.id] && <EarlyChangeBadge value={summaries[p.id].earlyChange} compact />}
                  </span>
                </td>
                {columns.map(({ inst, primary }) => {
                  const values = responsesFor(p, inst.id)
                    .map((r) => r.scores[primary.key])
                    .filter((v): v is number => typeof v === "number");
                  return (
                    <td key={inst.id} className="text-right px-3 py-2 whitespace-nowrap" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                      {values.length ? (
                        <span className="inline-flex items-center gap-1">
                          {fmtScore(values[values.length - 1])}
                          <MiniTrend values={values} higherIsBetter={primary.higherIsBetter ?? true} />
                          <span style={{ color: C.muted }}>({values.length}×)</span>
                        </span>
                      ) : (
                        <span style={{ color: C.muted }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/// Manual registration by director/administrator: the name is enough, but
/// e-mail and personal details can be recorded right away (self-registration
/// remains the normal path; the patient receives login credentials later).
function RegisterPatientCard({ onRegister }: { onRegister: (payload: RegisterPatientPayload) => Promise<void> }) {
  const t = useT();
  const { lang } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState(false);
  const [demo, setDemo] = useState<Demographics>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const setD = (k: keyof Demographics, v: string) => setDemo((prev) => ({ ...prev, [k]: v }));

  const errorText = (m: string) =>
    m === "email_taken" ? t("emailTaken")
    : m === "invalid_email" ? t("invalidEmail")
    : m === "network_restricted" ? t("networkRestricted")
    : m;

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const demographics = Object.fromEntries(Object.entries(demo).filter(([, v]) => v !== "" && v != null));
      await onRegister({ name: name.trim(), email: email.trim() || undefined, demographics });
      setName(""); setEmail(""); setDemo({});
      setMsg({ ok: true, text: t("patientRegistered") });
    } catch (e) {
      setMsg({ ok: false, text: errorText((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <SectionTitle sub={t("registerPatientSub")}>{t("registerPatientTitle")}</SectionTitle>
      <div className="flex gap-2">
        <input style={inputStyle} placeholder={t("fullName")} value={name} onChange={(e) => setName(e.target.value)} />
        <PrimaryButton small disabled={busy || !name.trim()} onClick={submit}>{t("register")}</PrimaryButton>
      </div>
      <button type="button" onClick={() => setDetails(!details)} className="text-xs font-semibold mt-3"
        style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {details ? "▴" : "▸"} {t("moreDetails")}
      </button>
      {details && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="col-span-2">
            <Field label={t("email")}>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
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
      )}
      {msg && <p className="text-xs mt-3" style={{ color: msg.ok ? C.spruce : C.danger }}>{msg.text}</p>}
    </Card>
  );
}

export function Dashboard({ data, user, onOpenPatient, onAssign, onRegisterPatient, onOpenMonitoring, onOpenArchive }: {
  data: ClinicData; user: SessionUser;
  onOpenPatient: (id: string) => void;
  onAssign: (id: string, therapistId: string | null) => void;
  onRegisterPatient: (payload: RegisterPatientPayload) => Promise<void>;
  onOpenMonitoring?: () => void;
  onOpenArchive: () => void;
}) {
  const t = useT();
  const isDirector = user.role === "director";
  const isAdmin = user.role === "admin";
  const clinicWide = isDirector || isAdmin;
  // Archived (concluded) patients live in the archive view, not the dashboard.
  const patients = (clinicWide ? data.patients : data.patients.filter((p) => p.therapistId === user.id))
    .filter((p) => p.status !== "archived");

  const unassigned = patients.filter((p) => !p.therapistId);
  const assignedIntake = patients.filter((p) => p.therapistId && p.status !== "therapy");
  const inTherapyAll = patients.filter((p) => p.status === "therapy");
  const [catFilter, setCatFilter] = useState<string>("all");
  const inTherapy = catFilter === "all" ? inTherapyAll : inTherapyAll.filter((p) => p.disorderCategory === catFilter);
  const presentCategories = DISORDER_CATEGORIES.filter((c) => inTherapyAll.some((p) => p.disorderCategory === c));

  const withScore = inTherapyAll.map(latestSessionScore).filter((v): v is number => v !== null);
  const avgProgress = withScore.length ? fmtScore(withScore.reduce((s, v) => s + v, 0) / withScore.length) : "—";
  const alertsOf = (p: Patient) => (isAdmin ? 0 : activeAlerts(p, data.instruments).length);

  const { lang } = useLang();
  const archivedCount = isAdmin ? 0 : archivedPatientsFor(data.patients, user).length;

  // Per-patient prediction badges (early change / not-on-track / dropout risk)
  // in ONE request — therapist/director only, best-effort (badges just stay
  // hidden when the request fails, e.g. off-network).
  const [summaries, setSummaries] = useState<Record<string, PredictionSummary>>({});
  useEffect(() => {
    if (isAdmin) return;
    let cancelled = false;
    api
      .getPredictionSummaries()
      .then((r) => {
        if (!cancelled) setSummaries(r.summaries);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin, data.patients.length]);

  const section = (title: string, list: Patient[], emptyText: string, extra?: React.ReactNode) => (
    <Card className="p-5 mb-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="lc-display text-lg" style={{ color: C.ink }}>{title} <span className="text-sm" style={{ color: C.muted }}>({list.length})</span></h2>
        {extra}
      </div>
      <div className="flex flex-col gap-2">
        {list.length === 0 && <p className="text-sm" style={{ color: C.muted }}>{emptyText}</p>}
        {list.map((p) => (
          <PatientRow key={p.id} p={p} user={user} therapists={data.therapists} alertCount={alertsOf(p)} summary={summaries[p.id]} onOpen={isAdmin ? undefined : onOpenPatient} onAssign={clinicWide ? onAssign : undefined} />
        ))}
      </div>
    </Card>
  );

  // Suicidality / safety flags across the visible caseload: a red warning at
  // the very top of the director's page and the assigned therapist's page.
  const flaggedPatients = isAdmin
    ? []
    : patients
        .map((p) => ({ p, alerts: activeAlerts(p, data.instruments) }))
        .filter((x) => x.alerts.length > 0);

  return (
    <div className="max-w-5xl mx-auto">
      {flaggedPatients.length > 0 && (
        <Card className="p-4 mb-5" style={{ background: "#F7E9E6", border: `2px solid ${C.danger}` }}>
          {flaggedPatients.map(({ p, alerts }) =>
            alerts.map((a) => (
              <button key={`${p.id}:${a.instrumentId}:${a.scaleKey}`} type="button" onClick={() => onOpenPatient(p.id)}
                className="w-full text-left flex items-center gap-2 flex-wrap py-1"
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <span className="text-sm font-bold" style={{ color: C.danger }}>⚠ {t("clinicalAlert")}:</span>
                <span className="text-sm font-bold" style={{ color: C.ink }}>{p.name}</span>
                <span className="text-sm" style={{ color: C.ink }}>— {a.instrumentAbbr} · {a.scaleLabel} = {a.value} ({fmtDate(a.occurredAt)})</span>
                <span className="text-xs ml-auto" style={{ color: C.danger }}>→</span>
              </button>
            )),
          )}
        </Card>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionTitle sub={isAdmin ? t("adminOverviewSub") : clinicWide ? t("clinicOverviewSub") : t("myPatientsSub")}>
          {clinicWide ? t("clinicOverview") : t("myPatients")}
        </SectionTitle>
        {onOpenMonitoring && (
          <button type="button" onClick={onOpenMonitoring} className="text-sm font-semibold"
            style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            {t("openMonitoring")}
          </button>
        )}
      </div>
      <div className="flex gap-3 mb-5 flex-wrap">
        <Stat label={t("statPatients")} value={patients.length} />
        <Stat label={t("statInTherapy")} value={inTherapyAll.length} />
        <Stat label={t("statAwaiting")} value={unassigned.length + assignedIntake.length} />
        {!isAdmin && <Stat label={t("statAvgProgress")} value={avgProgress} />}
      </div>

      {!isAdmin && (
        <Card className="p-5 mb-5">
          <SectionTitle sub={t("patientDevelopmentSub")}>{t("patientDevelopment")}</SectionTitle>
          <GlobalChart patients={patients} instruments={data.instruments} />
        </Card>
      )}

      {!isAdmin && <ScoresMatrix patients={patients} data={data} summaries={summaries} onOpenPatient={onOpenPatient} />}

      {section(
        t("sectionInTherapy"),
        inTherapy,
        clinicWide ? t("nonInThisCategory") : t("noPatientsAssigned"),
        presentCategories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCatFilter("all")} aria-pressed={catFilter === "all"} className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: catFilter === "all" ? C.spruce : C.surfaceAlt, color: catFilter === "all" ? "#fff" : C.muted, border: `1px solid ${catFilter === "all" ? C.spruce : C.line}`, cursor: "pointer" }}>
              {t("allDisorders")}
            </button>
            {presentCategories.map((c) => (
              <button key={c} type="button" onClick={() => setCatFilter(c)} aria-pressed={catFilter === c} className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: catFilter === c ? C.spruce : C.surfaceAlt, color: catFilter === c ? "#fff" : C.muted, border: `1px solid ${catFilter === c ? C.spruce : C.line}`, cursor: "pointer" }}>
                {trCategory(c, lang)}
              </button>
            ))}
          </div>
        ) : undefined,
      )}

      {clinicWide && section(t("sectionAssigned"), assignedIntake, t("nonInThisCategory"))}
      {clinicWide && section(t("sectionUnassigned"), unassigned, t("nonInThisCategory"))}

      {!clinicWide && assignedIntake.length + unassigned.length > 0 &&
        section(t("sectionAssigned"), [...unassigned, ...assignedIntake], t("nonInThisCategory"))}

      {clinicWide && (
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card className="p-5">
            <SectionTitle sub={t("caseloadSub")}>{t("therapistsTitle")}</SectionTitle>
            <div className="flex flex-col gap-2">
              {data.therapists.map((th) => {
                const n = data.patients.filter((p) => p.therapistId === th.id && p.status !== "archived").length;
                return (
                  <div key={th.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                    <div><p className="text-sm font-semibold" style={{ color: C.ink }}>{th.name}</p><p className="text-xs" style={{ color: C.muted }}>{th.title}</p></div>
                    <span className="text-sm font-bold" style={{ color: C.spruce, fontVariantNumeric: "tabular-nums" }}>{n} {t("patientsCount")}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <RegisterPatientCard onRegister={onRegisterPatient} />
        </div>
      )}

      {/* Director-only research export (docs/outcome-prediction.md §5) — the
          handover point to R/lme4/brms and research cooperations. Plain <a>
          downloads; the route enforces director + network gating server-side. */}
      {isDirector && (
        <Card className="p-5 mb-5">
          <SectionTitle sub={t("exportSub")}>{t("exportTitle")}</SectionTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="/api/export/research?level=scores" className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ color: C.spruce, border: `1px solid ${C.line}`, textDecoration: "none" }}>
              ⬇ {t("exportScores")}
            </a>
            <a href="/api/export/research?level=items" className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ color: C.spruce, border: `1px solid ${C.line}`, textDecoration: "none" }}>
              ⬇ {t("exportItems")}
            </a>
            <span className="text-xs" style={{ color: C.muted }}>{t("exportSimNote")}</span>
          </div>
        </Card>
      )}

      {/* Low-priority entry point to the archive of concluded treatments —
          deliberately at the very bottom of the page. Not shown to admin. */}
      {!isAdmin && (
        <div className="text-center pt-2 pb-6">
          <button type="button" onClick={onOpenArchive} className="text-xs font-semibold"
            style={{ color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            {t("archiveLink", { n: archivedCount })}
          </button>
        </div>
      )}
    </div>
  );
}
