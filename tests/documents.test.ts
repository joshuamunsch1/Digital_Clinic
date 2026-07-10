// Document-timeline construction (src/lib/document-types.ts) — pure, no DB.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STANDARD_DOC_SEQUENCE,
  buildDocumentTimeline,
  standardDocsPresent,
} from "../src/lib/document-types";
import type { DocumentRecord } from "../src/lib/types";

const doc = (docType: string, occurredAt: string, id = `${docType}-${occurredAt}`): DocumentRecord => ({
  id,
  docType,
  title: docType,
  fileName: `${docType}.pdf`,
  mimeType: "application/pdf",
  size: 1000,
  occurredAt,
  note: "",
  uploadedBy: null,
  createdAt: occurredAt,
});

test("empty timeline = all five standard docs pending, in canonical order", () => {
  const timeline = buildDocumentTimeline([]);
  assert.equal(timeline.length, STANDARD_DOC_SEQUENCE.length);
  assert.deepEqual(
    timeline.map((e) => (e.pending ? e.docType : "?")),
    [...STANDARD_DOC_SEQUENCE],
  );
  assert.equal(standardDocsPresent([]), 0);
});

test("real documents sort chronologically, missing standard types append as pending", () => {
  const docs = [
    doc("report", "2026-06-01T00:00:00.000Z"),
    doc("consent", "2026-04-01T00:00:00.000Z"),
    doc("confidentiality", "2026-04-02T00:00:00.000Z"),
  ];
  const timeline = buildDocumentTimeline(docs);
  const shape = timeline.map((e) => (e.pending ? `pending:${e.docType}` : e.doc.docType));
  assert.deepEqual(shape, [
    "consent",
    "confidentiality",
    "report",
    "pending:emergency_contacts",
    "pending:personal_goals",
  ]);
  assert.equal(standardDocsPresent(docs), 3);
});

test("recurring reports all appear; custom docs never produce pending entries", () => {
  const docs = [
    doc("report", "2026-05-01T00:00:00.000Z", "r1"),
    doc("report", "2026-07-01T00:00:00.000Z", "r2"),
    doc("other", "2026-06-01T00:00:00.000Z"),
  ];
  const timeline = buildDocumentTimeline(docs);
  const real = timeline.filter((e) => !e.pending);
  assert.deepEqual(
    real.map((e) => (e.pending ? "?" : e.doc.id)),
    ["r1", "other-2026-06-01T00:00:00.000Z", "r2"],
  );
  // "other" is not a standard type — exactly the four missing standard docs pend
  assert.deepEqual(
    timeline.filter((e) => e.pending).map((e) => (e.pending ? e.docType : "?")),
    ["consent", "confidentiality", "emergency_contacts", "personal_goals"],
  );
});

test("a complete checklist has no pending entries", () => {
  const docs = STANDARD_DOC_SEQUENCE.map((t, i) => doc(t, `2026-0${i + 1}-01T00:00:00.000Z`));
  assert.equal(buildDocumentTimeline(docs).filter((e) => e.pending).length, 0);
  assert.equal(standardDocsPresent(docs), STANDARD_DOC_SEQUENCE.length);
});
