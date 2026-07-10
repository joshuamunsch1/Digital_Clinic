"use client";
import React, { useRef, useState } from "react";
import { C } from "@/lib/theme";
import { fmtDate } from "@/lib/format";
import { api, documentDownloadUrl } from "@/lib/api-client";
import type { DocumentRecord, Patient, SessionUser } from "@/lib/types";
import {
  DOCUMENT_TYPES,
  DOC_TITLES_DE,
  STANDARD_DOC_SEQUENCE,
  buildDocumentTimeline,
  standardDocsPresent,
  type DocType,
} from "@/lib/document-types";
import { Card, Field, GhostButton, PrimaryButton, inputStyle } from "./ui";
import { useT } from "./LangContext";

const todayInput = () => new Date().toISOString().slice(0, 10);
const dateInput = (iso: string) => iso.slice(0, 10);
const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function TypeChip({ docType }: { docType: string }) {
  const colors =
    docType === "report"
      ? { bg: C.spruceSoft, fg: C.spruce }
      : docType === "other"
        ? { bg: C.surfaceAlt, fg: C.muted }
        : { bg: C.blueSoft, fg: C.blue };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: colors.bg, color: colors.fg }}>
      {DOC_TITLES_DE[docType as DocType] ?? docType}
    </span>
  );
}

/// Per-patient document timeline: the clinic's standard therapy-course documents
/// as an expected checklist (missing = pending) plus custom uploads, in
/// chronological order. Staff-only (documents never reach patient/admin payloads).
export function DocumentsPanel({ patient, user, onRefresh }: {
  patient: Patient;
  user: SessionUser;
  onRefresh: (p: Patient) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<DocType | null>(null); // pending row with an open upload form
  const [uploadDate, setUploadDate] = useState(todayInput());
  const uploadRef = useRef<HTMLInputElement>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<DocType>("other");
  const [addTitle, setAddTitle] = useState(DOC_TITLES_DE.other);
  const [addDate, setAddDate] = useState(todayInput());
  const [addNote, setAddNote] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  if (user.role !== "therapist" && user.role !== "director") return null;

  const timeline = buildDocumentTimeline(patient.documents);
  const present = standardDocsPresent(patient.documents);

  const run = async (fn: () => Promise<{ patient: Patient }>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      onRefresh(r.patient);
      setMsg(done);
      return true;
    } catch (e) {
      setMsg(`✗ ${(e as Error).message === "network_restricted" ? t("networkRestricted") : (e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const fileTemplate = (docType: DocType) => {
    const form = new FormData();
    form.set("docType", docType);
    form.set("template", "true");
    return run(() => api.uploadDocument(patient.id, form), t("docAdded"));
  };

  const uploadForPending = async (docType: DocType) => {
    const file = uploadRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("docType", docType);
    form.set("file", file);
    form.set("occurredAt", new Date(uploadDate).toISOString());
    if (await run(() => api.uploadDocument(patient.id, form), t("docAdded"))) setUploadFor(null);
  };

  const uploadCustom = async () => {
    const file = addRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("docType", addType);
    form.set("title", addTitle.trim());
    form.set("file", file);
    form.set("occurredAt", new Date(addDate).toISOString());
    if (addNote.trim()) form.set("note", addNote.trim());
    if (await run(() => api.uploadDocument(patient.id, form), t("docAdded"))) {
      setShowAdd(false);
      setAddNote("");
    }
  };

  const startEdit = (doc: DocumentRecord) => {
    setEditId(doc.id);
    setEditTitle(doc.title);
    setEditDate(dateInput(doc.occurredAt));
    setEditNote(doc.note);
  };
  const saveEdit = async (doc: DocumentRecord) => {
    const ok = await run(
      () =>
        api.updateDocument(doc.id, {
          title: editTitle.trim() || undefined,
          occurredAt: new Date(editDate).toISOString(),
          note: editNote,
        }),
      t("docUpdated"),
    );
    if (ok) setEditId(null);
  };
  const del = (doc: DocumentRecord) => {
    if (!window.confirm(t("confirmDeleteDoc"))) return;
    void run(() => api.deleteDocument(doc.id), t("docDeleted"));
  };

  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h3 className="text-sm font-bold" style={{ color: C.spruce }}>{t("documentsTitle")}</h3>
        <span className="ml-auto text-xs" style={{ color: present === STANDARD_DOC_SEQUENCE.length ? C.spruce : C.amber }}>
          {t("standardDocsCount", { n: present, total: STANDARD_DOC_SEQUENCE.length })}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: C.muted }}>{t("documentsSub")}</p>

      <div className="flex flex-col gap-2">
        {timeline.map((entry) =>
          entry.pending ? (
            <div key={`pending-${entry.docType}`} className="rounded-lg px-3 py-2" style={{ border: `1px dashed ${C.line}` }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.amberSoft, color: C.amber }}>
                  {t("docPending")}
                </span>
                <span className="text-sm font-semibold" style={{ color: C.muted }}>{DOC_TITLES_DE[entry.docType]}</span>
                <span className="ml-auto flex gap-2">
                  <GhostButton small onClick={() => { if (!busy) void fileTemplate(entry.docType); }}>{t("fileTemplate")}</GhostButton>
                  <GhostButton small onClick={() => { setUploadFor(uploadFor === entry.docType ? null : entry.docType); setUploadDate(todayInput()); }}>
                    {t("uploadFile")}
                  </GhostButton>
                </span>
              </div>
              {uploadFor === entry.docType && (
                <div className="flex items-end gap-2 flex-wrap mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  <Field label={t("docDateLabel")}>
                    <input type="date" style={{ ...inputStyle, width: "auto" }} value={uploadDate} onChange={(e) => setUploadDate(e.target.value)} />
                  </Field>
                  <Field label={t("docFileHint")}>
                    <input ref={uploadRef} type="file" accept="application/pdf,image/png,image/jpeg" className="text-xs" style={{ color: C.ink }} />
                  </Field>
                  <PrimaryButton small disabled={busy} onClick={() => void uploadForPending(entry.docType)}>{t("uploadConfirm")}</PrimaryButton>
                </div>
              )}
            </div>
          ) : (
            <div key={entry.doc.id} className="rounded-lg px-3 py-2" style={{ background: C.surfaceAlt }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold whitespace-nowrap" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                  {fmtDate(entry.doc.occurredAt)}
                </span>
                <TypeChip docType={entry.doc.docType} />
                {entry.doc.title !== (DOC_TITLES_DE[entry.doc.docType as DocType] ?? "") && (
                  <span className="text-sm font-semibold" style={{ color: C.ink }}>{entry.doc.title}</span>
                )}
                <span className="text-xs" style={{ color: C.muted }}>
                  {fmtBytes(entry.doc.size)}
                  {entry.doc.uploadedBy ? ` · ${t("uploadedByLabel")} ${entry.doc.uploadedBy.name}` : ""}
                </span>
                <span className="ml-auto flex gap-2 items-center">
                  <a
                    href={documentDownloadUrl(entry.doc.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg font-semibold px-3 py-1.5 text-xs"
                    style={{ color: C.spruce, border: `1px solid ${C.line}`, textDecoration: "none" }}
                  >
                    {t("openDoc")}
                  </a>
                  <GhostButton small onClick={() => (editId === entry.doc.id ? setEditId(null) : startEdit(entry.doc))}>{t("editDoc")}</GhostButton>
                  <GhostButton small onClick={() => del(entry.doc)}>{t("deleteDoc")}</GhostButton>
                </span>
              </div>
              {entry.doc.note && editId !== entry.doc.id && (
                <p className="text-xs mt-1" style={{ color: C.muted }}>{entry.doc.note}</p>
              )}
              {editId === entry.doc.id && (
                <div className="flex items-end gap-2 flex-wrap mt-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  <Field label={t("docTitleLabel")}>
                    <input style={{ ...inputStyle, width: 220 }} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </Field>
                  <Field label={t("docDateLabel")}>
                    <input type="date" style={{ ...inputStyle, width: "auto" }} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                  </Field>
                  <Field label={t("docNoteLabel")}>
                    <input style={{ ...inputStyle, width: 220 }} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                  </Field>
                  <PrimaryButton small disabled={busy} onClick={() => void saveEdit(entry.doc)}>{t("saveBtn")}</PrimaryButton>
                  <GhostButton small onClick={() => setEditId(null)}>{t("cancel")}</GhostButton>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="mt-3">
        {!showAdd ? (
          <GhostButton small onClick={() => setShowAdd(true)}>{t("addOwnDocument")}</GhostButton>
        ) : (
          <div className="rounded-lg p-3" style={{ background: C.surfaceAlt }}>
            <div className="flex items-end gap-2 flex-wrap">
              <Field label={t("docTypeLabel")}>
                <select
                  style={{ ...inputStyle, width: "auto", minWidth: 180 }}
                  value={addType}
                  onChange={(e) => {
                    const v = e.target.value as DocType;
                    setAddType(v);
                    setAddTitle(DOC_TITLES_DE[v]);
                  }}
                >
                  {DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{DOC_TITLES_DE[d]}</option>)}
                </select>
              </Field>
              <Field label={t("docTitleLabel")}>
                <input style={{ ...inputStyle, width: 220 }} value={addTitle} onChange={(e) => setAddTitle(e.target.value)} />
              </Field>
              <Field label={t("docDateLabel")}>
                <input type="date" style={{ ...inputStyle, width: "auto" }} value={addDate} onChange={(e) => setAddDate(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-end gap-2 flex-wrap mt-2">
              <Field label={t("docNoteLabel")}>
                <input style={{ ...inputStyle, width: 280 }} value={addNote} onChange={(e) => setAddNote(e.target.value)} />
              </Field>
              <Field label={t("docFileHint")}>
                <input ref={addRef} type="file" accept="application/pdf,image/png,image/jpeg" className="text-xs" style={{ color: C.ink }} />
              </Field>
              <PrimaryButton small disabled={busy} onClick={() => void uploadCustom()}>{t("uploadConfirm")}</PrimaryButton>
              <GhostButton small onClick={() => setShowAdd(false)}>{t("cancel")}</GhostButton>
            </div>
          </div>
        )}
      </div>

      {msg && <p className="text-xs mt-3" style={{ color: msg.startsWith("✗") ? C.danger : C.spruce }}>{msg}</p>}
    </Card>
  );
}
