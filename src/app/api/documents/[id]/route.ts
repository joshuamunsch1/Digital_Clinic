import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { staffNetworkGuard } from "@/lib/network";
import { PATIENT_INCLUDE, patientFromRow } from "@/lib/serialize";
import { isDocType } from "@/lib/document-types";
import { deleteDocumentFile, resolveDocumentPath } from "@/lib/documents";
import { therapistScoped } from "@/lib/access";
import type { SessionUser } from "@/lib/types";

function requireStaff(req: Request) {
  const s = getSession();
  if (!s || (s.role !== "director" && s.role !== "therapist"))
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const restricted = staffNetworkGuard(s, req);
  if (restricted) return { error: restricted };
  return { session: s };
}

/// Caseload scoping via the document's owning patient (director: everyone).
async function scopedToDocument(session: SessionUser, patientId: string) {
  const owner = await prisma.patient.findUnique({ where: { id: patientId }, select: { therapistId: true } });
  return owner !== null && therapistScoped(session, owner);
}

async function patientPayload(patientId: string) {
  const row = await prisma.patient.findUnique({ where: { id: patientId }, include: PATIENT_INCLUDE });
  return NextResponse.json({ patient: patientFromRow(row!) });
}

/// Download the stored file. This is the app's only binary download route —
/// files never leave DOCUMENTS_DIR by any other path.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = requireStaff(req);
  if ("error" in auth) return auth.error;

  const row = await prisma.patientDocument.findUnique({ where: { id: params.id } });
  if (!row || !row.storagePath) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await scopedToDocument(auth.session, row.patientId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const abs = resolveDocumentPath(row.storagePath);
  if (!abs) return NextResponse.json({ error: "not found" }, { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(abs);
  } catch {
    return NextResponse.json({ error: "file missing on disk" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/// Edit timeline metadata (clinical date, title, note, type) — not the file.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = requireStaff(req);
  if ("error" in auth) return auth.error;

  const row = await prisma.patientDocument.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await scopedToDocument(auth.session, row.patientId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { title?: string; occurredAt?: string; note?: string; docType?: string };
  const data: { title?: string; occurredAt?: Date; note?: string; docType?: string } = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.occurredAt === "string") {
    if (Number.isNaN(Date.parse(body.occurredAt)))
      return NextResponse.json({ error: "invalid occurredAt" }, { status: 400 });
    data.occurredAt = new Date(body.occurredAt);
  }
  if (typeof body.note === "string") data.note = body.note.trim().slice(0, 2000);
  if (body.docType !== undefined) {
    if (!isDocType(body.docType)) return NextResponse.json({ error: "unknown docType" }, { status: 400 });
    data.docType = body.docType;
  }
  await prisma.patientDocument.update({ where: { id: row.id }, data });
  return patientPayload(row.patientId);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = requireStaff(req);
  if ("error" in auth) return auth.error;

  const row = await prisma.patientDocument.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await scopedToDocument(auth.session, row.patientId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.patientDocument.delete({ where: { id: row.id } });
  if (row.storagePath) await deleteDocumentFile(row.storagePath);
  return patientPayload(row.patientId);
}
