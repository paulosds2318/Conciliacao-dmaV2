import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { getStoredPdf } from "@/lib/server/storage";
import { apiError } from "@/lib/server/http";
import { ACCEPTED_DOCUMENT_MIME_TYPES } from "@/lib/document-types";
type Context = { params: Promise<{ id: string; documentId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Nao autorizado.", 401);
  const { id, documentId } = await params;
  const doc = await db.requestDocument.findFirst({ where: { id: documentId, requestId: id }, include: { request: { select: { requesterId: true } } } });
  if (!doc) return apiError("Documento nao encontrado.", 404);
  if (user.role === "attendant" && doc.request.requesterId !== user.id) return apiError("Sem acesso a este documento.", 403);
  try { const bytes = await getStoredPdf(doc.storageKey); return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": ACCEPTED_DOCUMENT_MIME_TYPES.includes(doc.mimeType) ? doc.mimeType : "application/octet-stream", "Content-Disposition": `inline; filename="${encodeURIComponent(doc.originalName)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch { return apiError("Arquivo nao encontrado no armazenamento.", 404); }
}