import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { DOC_TITLES_DE, isDocType } from "@/lib/document-types";
import {
  DOC_MIME_EXT,
  MAX_DOC_BYTES,
  readTemplate,
  sanitizeFileName,
  storeDocumentFile,
} from "@/lib/documents";

/// Add a document to the patient's timeline. Multipart form:
///   docType (required), title?, occurredAt? (ISO), note?, and either
///   file (an upload) or template="true" (attach the placeholder template PDF).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return restricted;

  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return NextResponse.json({ error: "not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart form data" }, { status: 400 });
  }

  const docType = form.get("docType");
  if (!isDocType(docType)) return NextResponse.json({ error: "unknown docType" }, { status: 400 });

  const titleField = form.get("title");
  const title =
    (typeof titleField === "string" && titleField.trim()) || DOC_TITLES_DE[docType];

  const occurredAtField = form.get("occurredAt");
  const occurredAt =
    typeof occurredAtField === "string" && !Number.isNaN(Date.parse(occurredAtField))
      ? new Date(occurredAtField)
      : new Date();

  const noteField = form.get("note");
  const note = typeof noteField === "string" ? noteField.trim().slice(0, 2000) : "";

  // Resolve the file bytes: an uploaded file, or the placeholder template.
  let bytes: Buffer;
  let mimeType: string;
  let fileName: string;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_DOC_BYTES)
      return NextResponse.json(
        { error: `file too large (max ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB)` },
        { status: 400 },
      );
    if (!DOC_MIME_EXT[file.type])
      return NextResponse.json(
        { error: `unsupported file type '${file.type || "unknown"}' — allowed: PDF, PNG, JPEG` },
        { status: 400 },
      );
    bytes = Buffer.from(await file.arrayBuffer());
    mimeType = file.type;
    fileName = sanitizeFileName(file.name);
  } else if (form.get("template") === "true") {
    const template = await readTemplate(docType);
    if (!template)
      return NextResponse.json(
        { error: `no placeholder template exists for docType '${docType}'` },
        { status: 400 },
      );
    bytes = template;
    mimeType = "application/pdf";
    fileName = `${docType}.pdf`;
  } else {
    return NextResponse.json({ error: "provide a file or template=\"true\"" }, { status: 400 });
  }

  const row = await prisma.patientDocument.create({
    data: {
      patientId: patient.id,
      docType,
      title,
      fileName,
      mimeType,
      size: bytes.length,
      storagePath: "", // set below once the file is on disk
      uploadedById: s.id,
      occurredAt,
      note,
    },
  });
  try {
    const storagePath = await storeDocumentFile(patient.id, row.id, mimeType, bytes);
    await prisma.patientDocument.update({ where: { id: row.id }, data: { storagePath } });
  } catch (e) {
    await prisma.patientDocument.delete({ where: { id: row.id } });
    return NextResponse.json(
      { error: `could not store the file: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const updated = await prisma.patient.findUnique({ where: { id: params.id }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(updated!) });
}
