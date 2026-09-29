"use client";
import React, { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { tr, T, trCategory, trCadence, trDemoValue, trEmployment, trPopulation, trProblemDuration, trRaterRole, trSessionLogType, trSource, trTerminationReason } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";
import { api } from "@/lib/api-client";
import type { InstrumentDef } from "@/lib/instruments/types";
import { isScoreable } from "@/lib/instruments/types";
import { attendanceFeatures } from "@/lib/analytics/attendance";
import type { Patient, ResponseRecord, SessionLogRecord, SessionUser, Therapist } from "@/lib/types";
import { DIPS_INSTRUMENT_ID, DISORDER_CATEGORIES, TERMINATION_REASONS, activeAlerts, currentGoalRating, demographicAge, responsesFor } from "@/lib/types";
import type { PredictionPayload } from "@/lib/prediction/service";
import { primaryProposal } from "@/lib/dips/diagnosis";
import { STANDARD_DOC_SEQUENCE, standardDocsPresent } from "@/lib/document-types";
import { Card, CollapsibleCard, Field, GhostButton, MiniTrend, PrimaryButton, StatusBadge, inputStyle } from "./ui";
import { ScoreTable, SummaryStrip, TrajectoryChart, hasNativeAxis, occasionOf, type ChartPrediction, type ChartXMode } from "./charts";
import { ItemHeatmap, ProcessProfile } from "./heatmap";
import { AnswersView, ResponseDetail } from "./ResponseDetail";
import { previousResponse } from "@/lib/instruments/response-diff";
import { rawDataCsv, rawDataFileName } from "@/lib/raw-export";
import { GoalLevelChip } from "./GoalLadder";
import { DocumentsPanel } from "./DocumentsPanel";
import { InstrumentForm } from "./InstrumentForm";
import { SessionMonitoringPanel } from "./SessionMonitoringPanel";
import { PredictionPanel, type BandSource } from "./PredictionPanel";
import { useLang, useT } from "./LangContext";

function DefinitionBadge({ instrument }: { instrument: InstrumentDef }) {
  const t = useT();
  if (instrument.definitionStatus === "complete") return null;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}
      title={t("definitionBadgeTitle")}>
      {t("definitionBadge", { status: instrument.definitionStatus.replace("_", " ") })}
    </span>
  );
}

/// One individual filled-out questionnaire, expandable to its item-level
/// answers (ResponseDetail, compared with the same rater's previous response).
function ResponseRow({ instrument, response, responses, therapists }: {
  instrument: InstrumentDef;
  response: ResponseRecord;
  responses: ResponseRecord[];
  therapists: Therapist[];
}) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const occ = occasionOf(instrument, response);
  const conductedBy = therapists.find((th) => th.id === response.conductedById);
  return (
    <div className="rounded-lg" style={{ background: C.surfaceAlt }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left px-3 py-2 flex items-center gap-3 flex-wrap" style={{ background: "none", border: "none", cursor: "pointer" }}>
        <span className="text-xs font-bold" style={{ color: C.ink }}>{occ.label}</span>
        <span className="text-xs" style={{ color: C.muted }}>
          {fmtDate(response.occurredAt)} · {trRaterRole(response.respondentRole, lang)} · {t("via")} {trSource(response.source, lang)}
          {conductedBy ? ` · ${t("conductedBy")}: ${conductedBy.name}` : ""}
          {response.enteredBy ? ` · ${t("enteredByLine", { name: response.enteredBy.name })}` : ""}
        </span>
        <span className="ml-auto text-xs" style={{ color: C.spruce }}>{open ? t("hideAnswers") : t("viewAnswers")}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <ResponseDetail instrument={instrument} response={response} previous={previousResponse(responses, response)} therapists={therapists} />
        </div>
      )}
    </div>
  );
}

/// Cancelled/no-show chips + attendance rates under an every-session
/// trajectory chart. Deliberately NOT in-axis markers: missed appointments
/// carry no sessionNumber, and interpolating a chart position would fabricate
/// one — a dated strip is the honest rendering.
function AttendanceStrip({ responses, sessionLogs }: {
  responses: ResponseRecord[];
  sessionLogs: SessionLogRecord[];
}) {
  const t = useT();
  const { lang } = useLang();
  const misses = sessionLogs
    .filter((l) => l.type === "cancelled" || l.type === "no_show")
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  if (!misses.length) return null;
  const measured = Array.from(
    new Set(responses.map((r) => r.sessionNumber).filter((n): n is number => n !== null)),
  );
  const a = attendanceFeatures(sessionLogs, measured);
  const missRate = (a.cancellationRate ?? 0) + (a.noShowRate ?? 0);
  return (
    <div className="rounded-lg px-3 py-2 mb-3" style={{ background: C.surfaceAlt }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold" style={{ color: C.muted }}>{t("attendanceTitle")}</span>
        <span className="text-xs" style={{ color: C.muted }}>
          {t("attendanceRates", { cancelled: a.cancelled, noShow: a.noShow, pct: `${Math.round(missRate * 100)} %` })}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-1">
        {misses.slice(-12).map((l) => (
          <span key={l.id} className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={l.type === "cancelled"
              ? { background: C.amberSoft, color: C.amber }
              : { background: C.surface, color: C.danger, border: `1px solid ${C.danger}` }}>
            {trSessionLogType(l.type, lang)} {fmtDate(l.occurredAt)}
          </span>
        ))}
      </div>
    </div>
  );
}

function InstrumentCard({ instrument, responses, therapists, chartPrediction, selector, sessionLogs, bare, patientCode, initialView }: {
  /// Rendered inside the dossier's collapsible "Fragebogen-Verläufe" section
  /// (no own card; the section header carries the title).
  bare?: boolean;
  /// Research code — the raw-data CSV is pseudonymous (code, never the name).
  patientCode: string | null;
  /// Forced initial sub-view (SummaryStrip pill jump → latest answers).
  initialView?: "answers";
  instrument: InstrumentDef;
  responses: ResponseRecord[];
  therapists: Therapist[];
  chartPrediction?: ChartPrediction;
  /// Instrument switcher of the single questionnaire card (rendered above the
  /// heading); absent in contexts that show one fixed instrument.
  selector?: React.ReactNode;
  /// Session ledger for the attendance strip (every-session instruments only).
  sessionLogs?: SessionLogRecord[];
}) {
  const t = useT();
  const { lang } = useLang();
  const [showAll, setShowAll] = useState(false);
  const occasions = new Set(responses.map((r) => occasionOf(instrument, r).key)).size;
  const scoreable = isScoreable(instrument);
  const list = showAll ? [...responses].reverse() : [];
  // Secondary-block sub-view (Batch 13): Tabelle | Items | Prozessprofil. The
  // TrajectoryChart above stays ALWAYS mounted — unmounting it would reset its
  // lazily-initialized visible-scale state and drop the prediction overlays.
  // key={instrument.id} on this card resets the mode per instrument.
  const hasItemAnswers = instrument.items.length > 0 && responses.some((r) => Object.keys(r.rawAnswers).length > 0);
  const hasProcessProfile = scoreable && instrument.cadenceType === "every_session" && instrument.scales.length >= 3;
  // "Antworten" (Batch 16) leads: what the patient answered this time, item by
  // item, against last time — the view therapists open at the start of a session.
  const [subView, setSubView] = useState<"answers" | "table" | "items" | "process">(
    initialView ?? (hasItemAnswers ? "answers" : "table"),
  );
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(null);
  // x-axis of the trajectory chart: calendar date (default) or the native
  // session/wave axis. A per-viewer preference, remembered across dossiers.
  const [xMode, setXModeState] = useState<ChartXMode>(() => {
    try {
      return window.localStorage.getItem(X_MODE_KEY) === "native" ? "native" : "date";
    } catch {
      return "date";
    }
  });
  const setXMode = (m: ChartXMode) => {
    setXModeState(m);
    try {
      window.localStorage.setItem(X_MODE_KEY, m);
    } catch {
      // preference simply not remembered
    }
  };
  const nativeAxis = hasNativeAxis(instrument);
  const answerResponses = responses.filter((r) => Object.keys(r.rawAnswers).length > 0);
  // Chart point / heatmap column → that response's answers.
  const openResponse = (ids: string[]) => {
    const id = ids.find((x) => answerResponses.some((r) => r.id === x));
    if (!id) return;
    setSelectedResponseId(id);
    setSubView("answers");
  };
  const downloadRaw = () => {
    const blob = new Blob([rawDataCsv(instrument, responses, patientCode)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = rawDataFileName(instrument, patientCode);
    a.click();
    URL.revokeObjectURL(url);
  };
  const subViews: { key: typeof subView; label: string; show: boolean }[] = [
    { key: "answers", label: t("answersTab"), show: hasItemAnswers },
    { key: "table", label: t("tableTab"), show: scoreable },
    { key: "items", label: t("itemsTab"), show: hasItemAnswers },
    { key: "process", label: t("processTab"), show: hasProcessProfile },
  ];
  const shownViews = subViews.filter((v) => v.show);
  const activeView = shownViews.some((v) => v.key === subView) ? subView : (shownViews[0]?.key ?? "table");
  const content = (
    <>
      {selector && (
        <div className="flex items-center gap-3 flex-wrap mb-3">
          {!bare && <span className="text-xs font-bold" style={{ color: C.muted }}>{t("courseCardTitle")}</span>}
          {selector}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{instrument.abbreviation} · {instrument.name}</h3>
        <DefinitionBadge instrument={instrument} />
        <span className="ml-auto text-xs" style={{ color: C.muted }}>{responses.length} {t("responsesN")}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <p className="text-xs" style={{ color: C.muted }}>
          {trRaterRole(instrument.raterRole, lang)} · {trCadence(instrument.cadenceType, lang)} · {trPopulation(instrument.population, lang)}
        </p>
        {nativeAxis && scoreable && occasions >= 2 && (
          <span className="ml-auto flex items-center gap-1.5" role="group" aria-label={t("xAxisLabel")} title={t("axisDateHint")}>
            {(["date", "native"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setXMode(m)} aria-pressed={xMode === m}
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  background: xMode === m ? C.blue : C.surfaceAlt,
                  color: xMode === m ? "#fff" : C.muted,
                  border: `1px solid ${xMode === m ? C.blue : C.line}`,
                  cursor: "pointer",
                }}>
                {m === "date" ? t("axisDate") : instrument.cadenceType === "wave" ? t("axisWave") : t("axisSession")}
              </button>
            ))}
          </span>
        )}
      </div>
      {scoreable && occasions >= 2 && (
        <div className="mb-3">
          <TrajectoryChart instrument={instrument} responses={responses} prediction={chartPrediction}
            xMode={nativeAxis ? xMode : "date"} sessionLogs={sessionLogs}
            onSelectOccasion={hasItemAnswers ? openResponse : undefined} />
        </div>
      )}
      {instrument.cadenceType === "every_session" && sessionLogs && (
        <AttendanceStrip responses={responses} sessionLogs={sessionLogs} />
      )}
      {(shownViews.length > 1 || responses.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {shownViews.map((v) => (
            <button key={v.key} type="button" onClick={() => setSubView(v.key)} aria-pressed={activeView === v.key}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: activeView === v.key ? C.spruce : C.surfaceAlt,
                color: activeView === v.key ? "#fff" : C.muted,
                border: `1px solid ${activeView === v.key ? C.spruce : C.line}`,
                cursor: "pointer",
              }}>
              {v.label}
            </button>
          ))}
          <button type="button" onClick={downloadRaw} className="ml-auto text-xs font-semibold" title={t("rawCsvHint")}
            style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            ⤓ {t("rawCsv")}
          </button>
        </div>
      )}
      {activeView === "answers" && (
        <div className="mb-3">
          <AnswersView instrument={instrument} responses={answerResponses} therapists={therapists}
            selectedId={selectedResponseId} onSelect={setSelectedResponseId} />
        </div>
      )}
      {activeView === "table" && scoreable && <div className="mb-3"><ScoreTable instrument={instrument} responses={responses} /></div>}
      {activeView === "items" && (
        <div className="mb-3"><ItemHeatmap instrument={instrument} responses={responses} onSelectResponse={(id) => openResponse([id])} /></div>
      )}
      {activeView === "process" && <div className="mb-3"><ProcessProfile instrument={instrument} responses={responses} /></div>}
      {!scoreable && (
        <p className="text-xs mb-3" style={{ color: C.amber }}>{t("notScored", { status: instrument.definitionStatus })}</p>
      )}
      <button type="button" onClick={() => setShowAll(!showAll)} className="text-xs font-semibold" style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        {showAll ? t("hideIndividual") : t("viewIndividual")}
      </button>
      {showAll && (
        <div className="flex flex-col gap-2 mt-2">
          {list.map((r) => <ResponseRow key={r.id} instrument={instrument} response={r} responses={responses} therapists={therapists} />)}
        </div>
      )}
    </>
  );
  return bare ? <div>{content}</div> : <Card className="p-5 mb-4">{content}</Card>;
}

// Collapsible dossier sections (Batch 16). The open/closed set is a per-viewer
// preference shared across patients (remembered in localStorage — a
// convenience only; storage failures fall back to the defaults). Only the
// questionnaire course is open by default: every other section folds to a
// one-line summary.
type SectionId = "diagnosis" | "monitoring" | "prognosis" | "course" | "notes" | "documents" | "conclude";
const SECTION_IDS: SectionId[] = ["diagnosis", "monitoring", "prognosis", "course", "notes", "documents", "conclude"];
const DEFAULT_OPEN: SectionId[] = ["course"];
const OPEN_SECTIONS_KEY = "linden_dossier_open_v1";

function loadOpenSections(): Set<SectionId> {
  try {
    const raw = window.localStorage.getItem(OPEN_SECTIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed))
      return new Set(parsed.filter((x): x is SectionId => SECTION_IDS.includes(x as SectionId)));
  } catch {
    // storage unavailable (private window, blocked site data) → defaults
  }
  return new Set(DEFAULT_OPEN);
}

const X_MODE_KEY = "linden_chart_xmode";

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The former InvitationsPanel + SessionLogPanel were merged into the shared
// SessionMonitoringPanel (Batch 12) — one surface for the session ledger and
// questionnaire requests, also embedded per patient in MonitoringView.

export function PatientDetail({ patient, user, therapists, instruments, switchList, configured, onBack, onAssign, onSaveDiagnosis, onPatientUpdated, onStartDips, onOpenDiagnosis, onEditIntake, onOpenGoals, onOpenPatient }: {
  patient: Patient; user: SessionUser; therapists: Therapist[]; instruments: InstrumentDef[];
  /// Role-scoped active caseload for the quick-switcher (dashboard order).
  switchList: { id: string; name: string }[];
  /// Whether LimeSurvey is configured (ClinicData.limesurveyConfigured) — gates
  /// the e-mail channel + sync in the monitoring panel.
  configured: boolean;
  onBack: () => void; onAssign: (id: string, therapistId: string | null) => void;
  onSaveDiagnosis: (id: string, text: string, category: string, icdCode?: string) => void;
  onPatientUpdated: (p: Patient) => void;
  onStartDips: (id: string) => void;
  onOpenDiagnosis: (id: string) => void;
  onEditIntake: (id: string) => void;
  onOpenGoals: (id: string) => void;
  onOpenPatient: (id: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const therapist = therapists.find((th) => th.id === patient.therapistId);
  const [dxText, setDxText] = useState("");
  const [dxCategory, setDxCategory] = useState<string>("other");
  const [dxIcd, setDxIcd] = useState("");
  // Mechanical diagnosis proposal from the therapist-administered DIPS —
  // pre-fills the (still editable) diagnosis form; never auto-saved.
  const proposal = useMemo(
    () => (patient.dips ? primaryProposal(patient.dips.answers, { age: demographicAge(patient.demographics) }) : null),
    [patient.dips, patient.demographics],
  );
  useEffect(() => {
    if (!proposal || patient.diagnosis) return;
    setDxText((prev) => (prev.trim() ? prev : proposal.suggestedText));
    setDxIcd((prev) => (prev.trim() ? prev : proposal.icdCode));
    setDxCategory((prev) => (prev !== "other" ? prev : proposal.disorderCategory));
  }, [proposal, patient.diagnosis]);
  const [busy, setBusy] = useState(false);
  // Therapist-facing outcome prediction (docs/outcome-prediction.md) — fetched
  // for active therapy dossiers; the API rejects unassigned therapists (403),
  // in which case the panel simply stays hidden.
  const [prediction, setPrediction] = useState<PredictionPayload | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [bandSource, setBandSource] = useState<BandSource>("clinic");
  // Selected instrument of the single switchable questionnaire card.
  const [selInstId, setSelInstId] = useState<string | null>(null);
  // Bumped by a SummaryStrip pill click: remounts the card on "Antworten".
  const [focusNonce, setFocusNonce] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);
  // Manual paper-form entry launched from the monitoring panel — takes over
  // the dossier with the clinician InstrumentForm (same pattern as
  // MonitoringView); key={patient.id} on this component resets it per patient.
  const [manualEntry, setManualEntry] = useState<{ instrument: InstrumentDef; sessionNumber?: number } | null>(null);
  // Conclude-treatment (archive) state — see the card at the bottom of the page.
  const [archOutcome, setArchOutcome] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archMsg, setArchMsg] = useState<string | null>(null);
  // Section fold state. PatientDetail only ever renders client-side (after the
  // clinic payload loaded), so the lazy initializer may read localStorage.
  const [openSections, setOpenSections] = useState<Set<SectionId>>(loadOpenSections);
  const [pendingJump, setPendingJump] = useState<SectionId | null>(null);
  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(Array.from(openSections)));
    } catch {
      // preference simply not remembered
    }
  }, [openSections]);
  // Quick-nav jumps scroll AFTER the commit that expanded the target section.
  useEffect(() => {
    if (!pendingJump) return;
    document.getElementById(`dossier-${pendingJump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingJump(null);
  }, [pendingJump]);
  const isOpen = (id: SectionId) => openSections.has(id);
  const setSection = (id: SectionId, open: boolean) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const d = patient.demographics;
  const demoRows: [string, React.ReactNode][] = [
    [tr(T.age, lang), d.age], [tr(T.sex, lang), trDemoValue(d.sex, lang)], [tr(T.nationality, lang), d.nationality],
    [tr(T.city, lang), d.city], [tr(T.occupation, lang), d.occupation], [tr(T.living, lang), trDemoValue(d.living, lang)],
  ];
  // Read-only summary of the coded intake predictors (§4.3) — edited in the
  // IntakeEditView window together with the demographics.
  const cc = patient.caseCharacteristics;
  const predictorRows: [string, string][] = [
    [t("durationLabel"), cc.problemDuration ? trProblemDuration(cc.problemDuration, lang) : t("notRecorded")],
    [t("priorTxLabel"), cc.priorPsychotherapy === undefined ? t("notRecorded") : cc.priorPsychotherapy ? t("predYes") : t("predNo")],
    [t("medicationLabel"), cc.psychotropicMedication === undefined ? t("notRecorded") : cc.psychotropicMedication ? t("predYes") : t("predNo")],
    [t("employmentLabel"), cc.employment ? trEmployment(cc.employment, lang) : t("notRecorded")],
    [t("expectationLabel"), cc.treatmentExpectation === undefined ? t("notRecorded") : String(cc.treatmentExpectation)],
  ];
  const alerts = activeAlerts(patient, instruments);
  const isArchived = patient.status === "archived";
  const canArchive = user.role === "director" || (user.role === "therapist" && patient.therapistId === user.id);
  const showPrediction = patient.status === "therapy";

  useEffect(() => {
    if (!showPrediction) {
      setPrediction(null);
      return;
    }
    let cancelled = false;
    setPredictionLoading(true);
    api
      .getPrediction(patient.id)
      .then((r) => {
        if (!cancelled) setPrediction(r.prediction);
      })
      .catch(() => {
        if (!cancelled) setPrediction(null);
      })
      .finally(() => {
        if (!cancelled) setPredictionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patient.id, patient.responses.length, showPrediction]);

  /// Chart overlay (band/boundary/ETR/diamonds) for one instrument, driven by
  /// the panel's source toggle.
  const chartPredictionFor = (instrumentId: string): ChartPrediction | undefined => {
    if (!prediction) return undefined;
    // Alliance-rupture markers ride along whenever this instrument carries the
    // patient's monitored alliance scale (PSTB, or SBKJ for children).
    const alliance =
      prediction.alliance && prediction.alliance.instrumentId === instrumentId && prediction.alliance.signal.ruptures.length
        ? {
            ruptures: prediction.alliance.signal.ruptures.map((r) => ({ toSession: r.toSession })),
            ruptureScaleKey: prediction.alliance.scaleKey,
          }
        : undefined;
    const s = prediction.series.find((x) => x.instrumentId === instrumentId);
    // Not a prediction target (SBKJ): rupture markers can still apply — the
    // empty scaleKey never matches a visible scale, so no band ever activates.
    if (!s) return alliance ? { scaleKey: "", band: null, shifts: [], ...alliance } : undefined;
    const simulated = prediction.reference.includesSimulated;
    // NN bands are drawn blue so switching the source is visible at a glance.
    const band =
      bandSource === "clinic"
        ? {
            points: s.expectedCourse.points,
            label:
              t("bandLabelClinic", { n: s.expectedCourse.cases }) +
              (s.expectedCourse.stratified ? ` · ${t("bandStratified")}` : ""),
            simulated,
          }
        : bandSource === "nn" && s.nn.available && s.nn.points
          ? { points: s.nn.points, label: t("bandLabelNn", { k: s.nn.k ?? 0 }), simulated, color: C.blue }
          : null;
    // The NOT flag fires on the 80% tolerance boundary (p10/p90) — draw that
    // same line the flag actually uses, direction-aware per scale.
    const hib =
      instruments.find((i) => i.id === instrumentId)?.scales.find((k) => k.key === s.scaleKey)?.higherIsBetter ?? true;
    const clinicBoundary = s.expectedCourse.points.map((p) => ({
      session: p.session,
      value: hib ? p.p10 : p.p90,
    }));
    return {
      scaleKey: s.scaleKey,
      axis: s.axis,
      anchorAt: s.anchorAt,
      shiftAxis: s.shiftAxis,
      band,
      failureBoundary:
        bandSource === "nn" && s.nn.available
          ? s.nn.failureBoundary
          : bandSource === "clinic"
            ? clinicBoundary
            : undefined,
      etrPoints: bandSource === "etr" && s.etr.available ? s.etr.points : undefined,
      shifts: s.suddenShifts,
      ...alliance,
    };
  };

  /// The amber not-on-track signal (Stage 1 item 4) — distinct from the red
  /// safety alerts; red stays reserved for safety.
  const notOnTrackSeries = (prediction?.series ?? []).filter((s) => s.onTrack.status === "not_on_track");

  const doArchive = async () => {
    setBusy(true);
    setArchMsg(null);
    try {
      const r = await api.archivePatient(patient.id, archOutcome);
      onPatientUpdated(r.patient);
      setConfirmArchive(false);
      if (r.archiveExport && !r.archiveExport.ok)
        setArchMsg(t("archiveExportFailed", { error: r.archiveExport.error ?? "" }));
    } catch (e) {
      setArchMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const doUnarchive = async () => {
    setBusy(true);
    setArchMsg(null);
    try {
      const r = await api.unarchivePatient(patient.id);
      onPatientUpdated(r.patient);
    } catch (e) {
      setArchMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const instrumentsWithData = instruments
    .filter((i) => i.id !== DIPS_INSTRUMENT_ID)
    .map((i) => ({ instrument: i, responses: responsesFor(patient, i.id) }))
    .filter((x) => x.responses.length > 0)
    .sort((a, b) => b.responses.length - a.responses.length);
  // The switchable questionnaire card defaults to the most-filled instrument.
  const selected = instrumentsWithData.find((x) => x.instrument.id === selInstId) ?? instrumentsWithData[0];
  const notes = patient.responses.filter((r) => r.note);

  // Quick-nav jump targets, in page order; entries appear only when their
  // section renders. A jump expands the target section first.
  const switchIdx = switchList.findIndex((p) => p.id === patient.id);
  const navItems: { id: SectionId; label: string }[] = [
    { id: "diagnosis", label: t("navDiagnosis") },
    { id: "monitoring", label: t("navMonitoring") },
    ...(showPrediction ? [{ id: "prognosis" as const, label: t("navPrognosis") }] : []),
    ...(instrumentsWithData.length ? [{ id: "course" as const, label: t("navCourse") }] : []),
    ...(notes.length ? [{ id: "notes" as const, label: t("navNotes") }] : []),
    { id: "documents", label: t("navDocuments") },
    ...(canArchive && !isArchived ? [{ id: "conclude" as const, label: t("navConclude") }] : []),
  ];
  const jumpTo = (id: SectionId) => {
    setSection(id, true);
    setPendingJump(id);
  };
  const focusInstrument = (instrumentId: string) => {
    setSelInstId(instrumentId);
    setFocusNonce((n) => n + 1);
    jumpTo("course");
  };
  const allOpen = navItems.every((n) => isOpen(n.id));
  const setAllSections = (open: boolean) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      for (const n of navItems) {
        if (open) next.add(n.id);
        else next.delete(n.id);
      }
      return next;
    });

  // One-line summaries shown while a section is folded.
  const diagnosisSummary: React.ReactNode = patient.diagnosis ? (
    [
      patient.icdCode,
      truncate(patient.diagnosis.text, 48),
      patient.goals.length ? t("sumGoalsN", { n: patient.goals.length }) : null,
    ]
      .filter(Boolean)
      .join(" · ")
  ) : isArchived ? (
    "—"
  ) : (
    <span className="font-semibold" style={{ color: C.amber }}>
      {patient.dips ? t("sumDiagnosisPending") : t("sumDipsPending")}
    </span>
  );
  const dropoutPct =
    prediction?.dropoutRisk.available && prediction.dropoutRisk.probability !== undefined
      ? Math.round(prediction.dropoutRisk.probability * 100)
      : null;
  const prognosisSummary: React.ReactNode = predictionLoading ? (
    t("loading")
  ) : !prediction ? (
    t("predictionUnavailable")
  ) : (
    <>
      {notOnTrackSeries.length > 0 ? (
        <span className="font-semibold" style={{ color: C.amber }}>⚑ {t("notOnTrack")}</span>
      ) : prediction.series.some((x) => x.onTrack.status === "on_track") ? (
        <span className="font-semibold" style={{ color: C.spruce }}>{t("onTrack")}</span>
      ) : (
        t("insufficientReference")
      )}
      {dropoutPct !== null && ` · ${t("sumDropout", { pct: dropoutPct })}`}
    </>
  );
  const measuredAts = instrumentsWithData.flatMap((x) => x.responses.map((r) => r.occurredAt)).sort();
  const lastMeasuredAt = measuredAts[measuredAts.length - 1];
  const courseSummary = lastMeasuredAt
    ? t("sumCourse", { n: instrumentsWithData.length, date: fmtDate(lastMeasuredAt) })
    : "";
  const lastNote = notes[notes.length - 1];
  const notesSummary = lastNote ? t("sumNotes", { n: notes.length, date: fmtDate(lastNote.occurredAt) }) : "";
  const docsPresent = standardDocsPresent(patient.documents);
  const docsBadge = (
    <span className="text-xs" style={{ color: docsPresent === STANDARD_DOC_SEQUENCE.length ? C.spruce : C.amber }}>
      {t("standardDocsCount", { n: docsPresent, total: STANDARD_DOC_SEQUENCE.length })}
    </span>
  );

  if (manualEntry) {
    return (
      <InstrumentForm
        instrument={manualEntry.instrument}
        clinicianMode
        therapists={therapists}
        defaultConductedById={user.role === "therapist" ? user.id : patient.therapistId}
        defaultSessionNumber={manualEntry.sessionNumber}
        busy={busy}
        onCancel={() => setManualEntry(null)}
        onSubmit={async (payload) => {
          setBusy(true);
          try {
            const r = await api.submitResponse(patient.id, payload);
            onPatientUpdated(r.patient);
            setManualEntry(null);
            if (r.skippedScales.length) alert(`${t("scalesNotComputed")}\n${r.skippedScales.map((s) => `${s.key}: ${s.reason}`).join("\n")}`);
          } catch (e) {
            alert("✗ " + (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={onBack} className="text-sm font-semibold" style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>{t("backToOverview")}</button>
        {/* Quick-switcher through the active caseload — hidden when this
            dossier is not in it (e.g. archived patients opened from the archive). */}
        {switchIdx >= 0 && (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" title={t("prevPatient")} aria-label={t("prevPatient")} disabled={switchIdx <= 0}
              onClick={() => onOpenPatient(switchList[switchIdx - 1].id)}
              className="rounded-lg font-semibold px-3 py-1.5 text-sm"
              style={{ background: "transparent", color: switchIdx <= 0 ? C.muted : C.spruce, border: `1px solid ${C.line}`, cursor: switchIdx <= 0 ? "not-allowed" : "pointer" }}>
              ‹
            </button>
            <select style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13 }} aria-label={t("switchPatientLabel")}
              value={patient.id} onChange={(e) => onOpenPatient(e.target.value)}>
              {switchList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" title={t("nextPatient")} aria-label={t("nextPatient")} disabled={switchIdx >= switchList.length - 1}
              onClick={() => onOpenPatient(switchList[switchIdx + 1].id)}
              className="rounded-lg font-semibold px-3 py-1.5 text-sm"
              style={{ background: "transparent", color: switchIdx >= switchList.length - 1 ? C.muted : C.spruce, border: `1px solid ${C.line}`, cursor: switchIdx >= switchList.length - 1 ? "not-allowed" : "pointer" }}>
              ›
            </button>
          </span>
        )}
      </div>

      {/* Sticky quick-nav — the dossier is long; one click beats scrolling.
          The window scrolls the page (no inner container) and the app header
          is not sticky, so top-0 pins this bar to the viewport. */}
      <nav className="sticky top-0 z-10 py-2 mb-2 flex gap-2 flex-wrap items-center" style={{ background: C.bg }}>
        {navItems.map((n) => (
          <button key={n.id} type="button" onClick={() => jumpTo(n.id)}
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: isOpen(n.id) ? C.spruceSoft : C.surface,
              color: C.spruce,
              border: `1px solid ${isOpen(n.id) ? C.spruce : C.line}`,
              cursor: "pointer",
            }}>
            {n.label}
          </button>
        ))}
        <button type="button" onClick={() => setAllSections(!allOpen)}
          className="ml-auto text-xs font-semibold"
          style={{ color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
          {allOpen ? `▴ ${t("collapseAll")}` : `▾ ${t("expandAll")}`}
        </button>
      </nav>

      {alerts.map((a) => (
        <Card key={`${a.instrumentId}:${a.scaleKey}`} className="p-4 mb-4" style={{ background: "#F7E9E6", border: `1px solid ${C.danger}` }}>
          <p className="text-sm font-bold" style={{ color: C.danger }}>⚠ {t("clinicalAlert")} — {a.instrumentAbbr}</p>
          <p className="text-sm mt-1" style={{ color: C.ink }}>
            {a.message} ({a.scaleLabel} = {a.value}, {fmtDate(a.occurredAt)})
          </p>
        </Card>
      ))}

      {/* Amber "not on track" banner — decision support, NOT a safety alarm. */}
      {notOnTrackSeries.length > 0 && (
        <Card className="p-4 mb-4" style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
          <p className="text-sm font-bold" style={{ color: C.amber }}>⚑ {t("notOnTrackBanner")}</p>
          <p className="text-sm mt-1" style={{ color: C.ink }}>
            {notOnTrackSeries
              .map(
                (s) =>
                  `${instruments.find((i) => i.id === s.instrumentId)?.abbreviation ?? s.instrumentId}: ${s.onTrack.reasons
                    .map((r) => (r === "below_band" ? t("notReasonBand") : t("notReasonRci")))
                    .join(" + ")}`,
              )
              .join(" · ")}
          </p>
          <p className="text-xs mt-1" style={{ color: C.muted }}>{t("notOnTrackHint")}</p>
        </Card>
      )}

      {isArchived && (
        <Card className="p-4 mb-4" style={{ background: C.surfaceAlt }}>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold" style={{ color: C.ink }}>
                {t("archivedOn", { date: patient.archivedAt ? fmtDate(patient.archivedAt) : "—" })}
                {patient.archivedBy ? ` ${t("archivedByLine", { name: patient.archivedBy })}` : ""}
              </p>
              {patient.terminationReason && (
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                  {t("terminationLabel")}: {trTerminationReason(patient.terminationReason, lang)}
                </p>
              )}
            </div>
            {canArchive && (
              <span className="ml-auto"><GhostButton small onClick={doUnarchive}>{t("reopenTreatment")}</GhostButton></span>
            )}
          </div>
          {archMsg && <p className="text-xs mt-2" style={{ color: C.amber }}>{archMsg}</p>}
        </Card>
      )}

      <Card className="p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="rounded-full" style={{ width: 14, height: 14, background: patient.color }} />
            <div>
              <h2 className="lc-display text-2xl" style={{ color: C.ink }}>{patient.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge status={patient.status} />
                {patient.disorderCategory && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.blueSoft, color: C.blue }}>
                    {trCategory(patient.disorderCategory, lang)}
                  </span>
                )}
                <span className="text-xs" style={{ color: C.muted }}>
                  {patient.responses.length > 0 ? `${patient.responses.length} ${t("questionnairesOnFile")}` : t("noQuestionnairesYet")}
                  {patient.email ? ` · ${patient.email}` : ""}
                  {patient.code ? ` · ${t("patientCodeLabel")}: ` : ""}
                  {patient.code && <b style={{ color: C.ink, letterSpacing: 1 }}>{patient.code}</b>}
                </span>
                {/* Paper forms are matched by this code (intern entry) — one
                    click to copy it onto a label / the form header. */}
                {patient.code && (
                  <button type="button" title={t("copyCodeHint")} className="text-xs font-semibold"
                    onClick={() => {
                      try {
                        void navigator.clipboard.writeText(patient.code!).then(() => setCodeCopied(true));
                      } catch {
                        // clipboard unavailable — the code stays visible to copy by hand
                      }
                    }}
                    style={{ color: C.spruce, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                    {codeCopied ? `✓ ${t("codeCopied")}` : `⧉ ${t("copyCode")}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {instrumentsWithData.length > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
            <p className="text-xs font-bold mb-1" style={{ color: C.spruce }}>{t("summaryTitle")}</p>
            {/* Legend for the trend glyphs and the level bar in the pills below. */}
            <p className="text-xs mb-2 flex items-center gap-x-3 gap-y-1 flex-wrap" style={{ color: C.muted }}>
              <span>
                <span style={{ color: C.spruce }}>▲</span>/<span style={{ color: C.danger }}>▼</span> {t("legendTrend")}
              </span>
              <span>► {t("legendStable")}</span>
              <span>– {t("legendNoTrend")}</span>
              <span>{t("legendBar")}</span>
            </p>
            <SummaryStrip patient={patient} instruments={instruments.filter((i) => i.id !== DIPS_INSTRUMENT_ID)} onSelect={focusInstrument} />
          </div>
        )}
        <div className="mt-4 pt-4 flex items-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${C.line}` }}>
          <span className="text-sm font-semibold" style={{ color: C.ink }}>{t("therapistLabel")}</span>
          {user.role === "director" ? (
            <select style={{ ...inputStyle, width: "auto", minWidth: 200 }} value={patient.therapistId || ""} onChange={(e) => onAssign(patient.id, e.target.value || null)}>
              <option value="">{t("unassigned")}</option>
              {therapists.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
            </select>
          ) : (
            <span className="text-sm" style={{ color: C.muted }}>{therapist ? therapist.name : t("unassigned")}</span>
          )}
        </div>
      </Card>

      {/* Intake & diagnosis — the once-per-treatment data in one card: diagnosis
          (left), demographics + intake predictors (right, read-only summaries;
          edited in the full-window IntakeEditView). */}
      <CollapsibleCard id="dossier-diagnosis" title={t("intakeCardTitle")} summary={diagnosisSummary}
        open={isOpen("diagnosis")} onToggle={() => setSection("diagnosis", !isOpen("diagnosis"))}>
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: C.muted }}>{t("diagnosisTitle")}</p>
            {patient.diagnosis ? (
              <div>
                <p className="text-sm font-semibold" style={{ color: C.ink }}>
                  {patient.diagnosis.text}
                  {patient.icdCode && (
                    <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full align-middle" style={{ background: C.blueSoft, color: C.blue }}>
                      {patient.icdCode}
                    </span>
                  )}
                </p>
                <p className="text-xs mt-1" style={{ color: C.muted }}>{t("recordedOn")} {fmtDate(patient.diagnosis.date)} · {patient.diagnosis.by}</p>
              </div>
            ) : isArchived ? (
              <p className="text-sm" style={{ color: C.muted }}>—</p>
            ) : !patient.dips ? (
              // Gate: the DIPS interview is required before a diagnosis can be
              // recorded. Startable from registration on — the demographics
              // intake does not gate the interview.
              <div>
                <p className="text-sm mb-3" style={{ color: C.muted }}>{t("dipsRequired")}</p>
                <PrimaryButton small onClick={() => onStartDips(patient.id)}>{t("startDipsInterview")}</PrimaryButton>
              </div>
            ) : (
              <div>
                {proposal ? (
                  <p className="mb-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>{t("proposalChip")}</span>
                  </p>
                ) : (
                  <p className="text-sm mb-2" style={{ color: C.muted }}>{t("noProposal")}</p>
                )}
                <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} placeholder={t("diagnosisPlaceholder")} value={dxText} onChange={(e) => setDxText(e.target.value)} />
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Field label={t("disorderCategoryLabel")}>
                    <select style={{ ...inputStyle, width: "auto", minWidth: 170 }} value={dxCategory} onChange={(e) => setDxCategory(e.target.value)}>
                      {DISORDER_CATEGORIES.map((c) => <option key={c} value={c}>{trCategory(c, lang)}</option>)}
                    </select>
                  </Field>
                  <Field label={t("icdLabel")}>
                    <input style={{ ...inputStyle, width: 110 }} placeholder="F41.0" value={dxIcd} onChange={(e) => setDxIcd(e.target.value.toUpperCase())} />
                  </Field>
                </div>
                <div className="mt-2">
                  <PrimaryButton small disabled={!dxText.trim()} onClick={() => onSaveDiagnosis(patient.id, dxText.trim(), dxCategory, dxIcd.trim() || undefined)}>{t("saveDiagnosis")}</PrimaryButton>
                </div>
              </div>
            )}
            {/* GAS therapy goals at a glance: title + current attainment chip +
                trend. Entry/rating happens in the full-window GoalsView. */}
            <p className="text-xs font-bold mb-2 mt-4" style={{ color: C.muted }}>{t("goalsTitle")}</p>
            {patient.goals.length ? (
              <div className="flex flex-col gap-1">
                {patient.goals.map((g) => {
                  const cur = currentGoalRating(g);
                  return (
                    <div key={g.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: C.surfaceAlt }}>
                      <span className="text-sm truncate flex-1" style={{ color: C.ink }} title={g.title}>{g.title}</span>
                      <MiniTrend values={g.ratings.map((r) => r.level)} />
                      {cur ? <GoalLevelChip level={cur.level} /> : <span className="text-xs" style={{ color: C.muted }}>—</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <p className="text-sm" style={{ color: C.muted }}>{t("goalsNone")}</p>
                {!isArchived && (
                  <div className="mt-2"><GhostButton small onClick={() => onOpenGoals(patient.id)}>{t("goalsDefine")}</GhostButton></div>
                )}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: C.muted }}>{t("demographicsTitle")}</p>
            {d && Object.keys(d).length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {demoRows.map(([k, v]) => (<React.Fragment key={String(k)}><dt style={{ color: C.muted }}>{k}</dt><dd className="font-semibold" style={{ color: C.ink }}>{v || "—"}</dd></React.Fragment>))}
              </dl>
            ) : (<p className="text-sm" style={{ color: C.muted }}>{t("noIntakeYet")}</p>)}
            <p className="text-xs font-bold mb-2 mt-4" style={{ color: C.muted }}>{t("predictorsTitle")}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {predictorRows.map(([k, v]) => (<React.Fragment key={k}><dt style={{ color: C.muted }}>{k}</dt><dd className="font-semibold" style={{ color: C.ink }}>{v}</dd></React.Fragment>))}
            </dl>
          </div>
        </div>
        <div className="mt-4 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${C.line}` }}>
          {(patient.dips || !isArchived) && <GhostButton small onClick={() => onOpenDiagnosis(patient.id)}>{t("openDiagnosisView")}</GhostButton>}
          {!isArchived && <GhostButton small onClick={() => onEditIntake(patient.id)}>{t("editIntake")}</GhostButton>}
          {!(isArchived && patient.goals.length === 0) && (
            <GhostButton small onClick={() => onOpenGoals(patient.id)}>{t("openGoalsView")}</GhostButton>
          )}
        </div>
      </CollapsibleCard>

      {/* Sessions & questionnaires — the unified ledger + monitoring panel
          (read-only on archived dossiers; it self-hides when empty there). */}
      <SessionMonitoringPanel
        patient={patient}
        instruments={instruments}
        therapists={therapists}
        user={user}
        configured={configured}
        variant="dossier"
        expanded={isOpen("monitoring")}
        onExpandedChange={(v) => setSection("monitoring", v)}
        onPatientUpdated={onPatientUpdated}
        onStartManualEntry={(instrument, ctx) => setManualEntry({ instrument, sessionNumber: ctx.sessionNumber })}
      />

      {/* Therapist-facing outcome prediction — active therapy dossiers only.
          Sits directly above the trajectory charts its source toggle drives. */}
      {showPrediction && (
        <CollapsibleCard id="dossier-prognosis" title={t("predictionTitle")} summary={prognosisSummary}
          open={isOpen("prognosis")} onToggle={() => setSection("prognosis", !isOpen("prognosis"))}>
          <PredictionPanel bare prediction={prediction} loading={predictionLoading} source={bandSource} onSourceChange={setBandSource} />
        </CollapsibleCard>
      )}

      {instrumentsWithData.length === 0 && (
        <Card className="p-5 mb-4"><p className="text-sm" style={{ color: C.muted }}>{t("noDataYet")}</p></Card>
      )}
      {/* ONE switchable questionnaire card (selector like the overview's
          patient-development tab). key= forces a clean remount per instrument:
          TrajectoryChart's visible-scale set initializes lazily, so a prop
          swap without remount would keep the previous instrument's scale keys
          and break both the lines and the prediction-overlay gating. */}
      {selected && (
        <CollapsibleCard id="dossier-course" title={t("courseCardTitle")} summary={courseSummary}
          open={isOpen("course")} onToggle={() => setSection("course", !isOpen("course"))}>
          <InstrumentCard
            bare
            key={`${selected.instrument.id}:${focusNonce}`}
            patientCode={patient.code}
            initialView={focusNonce > 0 ? "answers" : undefined}
            instrument={selected.instrument}
            responses={selected.responses}
            therapists={therapists}
            chartPrediction={chartPredictionFor(selected.instrument.id)}
            sessionLogs={patient.sessionLogs}
            selector={
              <select style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13, maxWidth: "100%" }}
                aria-label={t("instrumentLabel")} value={selected.instrument.id} onChange={(e) => setSelInstId(e.target.value)}>
                {instrumentsWithData.map(({ instrument, responses }) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.abbreviation} — {instrument.name.length > 40 ? `${instrument.name.slice(0, 40)}…` : instrument.name} ({responses.length})
                  </option>
                ))}
              </select>
            }
          />
        </CollapsibleCard>
      )}

      {notes.length > 0 && (
        <CollapsibleCard id="dossier-notes" title={t("notesTitle")} summary={notesSummary}
          open={isOpen("notes")} onToggle={() => setSection("notes", !isOpen("notes"))}>
          <div className="flex flex-col gap-2">
            {[...notes].reverse().map((r) => (
              <div key={r.id} className="rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
                <p className="text-xs font-bold" style={{ color: C.muted }}>{r.sessionNumber !== null ? `${t("sessionN")} ${r.sessionNumber}` : ""} · {fmtDate(r.occurredAt)}</p>
                <p className="text-sm mt-0.5" style={{ color: C.ink }}>{r.note}</p>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Document timeline — filed paperwork, deliberately at the bottom of
          the dossier, directly above the conclude-&-archive card. */}
      <CollapsibleCard id="dossier-documents" title={t("documentsTitle")} right={docsBadge}
        open={isOpen("documents")} onToggle={() => setSection("documents", !isOpen("documents"))}>
        <DocumentsPanel bare patient={patient} user={user} onRefresh={onPatientUpdated} />
      </CollapsibleCard>

      {/* Conclude treatment & archive — deliberately the last, low-key card. */}
      {canArchive && !isArchived && (
        <CollapsibleCard id="dossier-conclude" title={t("concludeTitle")} summary={t("sumConclude")}
          open={isOpen("conclude")} onToggle={() => setSection("conclude", !isOpen("conclude"))}>
          <p className="text-xs mb-3" style={{ color: C.muted }}>{t("concludeSub")}</p>
          <div className="flex items-end gap-3 flex-wrap">
            <Field label={t("terminationLabel")}>
              <select style={{ ...inputStyle, width: "auto", minWidth: 240 }} value={archOutcome} onChange={(e) => setArchOutcome(e.target.value)}>
                <option value="">{t("terminationNone")}</option>
                {TERMINATION_REASONS.map((r) => (
                  <option key={r} value={r}>{trTerminationReason(r, lang)}</option>
                ))}
              </select>
            </Field>
            {confirmArchive ? (
              <>
                <button type="button" onClick={doArchive} disabled={busy || !archOutcome} className="text-xs font-bold px-3 py-2 rounded-lg"
                  style={{ background: C.danger, color: "#fff", border: "none", cursor: busy ? "wait" : "pointer", opacity: archOutcome ? 1 : 0.5 }}>
                  {t("archiveConfirm")}
                </button>
                <GhostButton small onClick={() => setConfirmArchive(false)}>{t("cancel")}</GhostButton>
              </>
            ) : (
              <GhostButton small disabled={!archOutcome} onClick={() => setConfirmArchive(true)}>{t("concludeTitle")}</GhostButton>
            )}
          </div>
          {archMsg && <p className="text-xs mt-2" style={{ color: C.danger }}>{archMsg}</p>}
        </CollapsibleCard>
      )}
    </div>
  );
}
