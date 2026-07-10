// Server-side file storage for patient timeline documents.
// Files live OUTSIDE the database, under DOCUMENTS_DIR (default ./documents),
// at "<patientId>/<documentId>.<ext>" — the relative path is stored on the
// PatientDocument row. On-disk names are server-generated (cuid + allowlisted
// extension); resolveDocumentPath re-checks containment as defense in depth.
import fs from "node:fs/promises";
import path from "node:path";
import type { DocType } from "./document-types";

export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB — prototype cap, checked in-handler

/// Upload allowlist: signed forms arrive as PDFs or phone-camera scans.
export const DOC_MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export function documentsRoot(): string {
  return process.env.DOCUMENTS_DIR || path.join(process.cwd(), "documents");
}

/// Write a document file; returns the relative storagePath for the row.
export async function storeDocumentFile(
  patientId: string,
  documentId: string,
  mimeType: string,
  bytes: Buffer,
): Promise<string> {
  const ext = DOC_MIME_EXT[mimeType];
  if (!ext) throw new Error(`unsupported mime type: ${mimeType}`);
  const rel = path.join(patientId, `${documentId}.${ext}`);
  const abs = path.join(documentsRoot(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, bytes);
  return rel;
}

/// Absolute path for a stored document, or null if the stored relative path
/// would escape the documents root.
export function resolveDocumentPath(storagePath: string): string | null {
  const root = path.resolve(documentsRoot());
  const abs = path.resolve(root, storagePath);
  return abs.startsWith(root + path.sep) ? abs : null;
}

export async function deleteDocumentFile(storagePath: string): Promise<void> {
  const abs = resolveDocumentPath(storagePath);
  if (!abs) return;
  try {
    await fs.unlink(abs);
  } catch {
    // best-effort: a missing file must never block deleting the row
  }
}

/// Placeholder template PDF for a standard document type (none for "other").
export async function readTemplate(docType: DocType): Promise<Buffer | null> {
  if (docType === "other") return null;
  const abs = path.join(process.cwd(), "templates", "documents", `${docType}.pdf`);
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/// Remove all stored document files (demo reset — rows are wiped by the seed).
export async function wipeDocumentsDir(): Promise<void> {
  try {
    await fs.rm(documentsRoot(), { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/// Keep a human-readable download name without any path or control characters.
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "_")
    .trim();
  return (cleaned || "dokument").slice(0, 120);
}
