import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  const job = await db.bulkActionJob.findUnique({ where: { id }, include: { requester: { select: { id: true, name: true } }, items: { orderBy: { rowNumber: "asc" }, include: { attempts: { orderBy: { attemptNumber: "asc" } } } } } });
  if (!job || job.deletedAt) return apiError("Ação manual não encontrada.", 404);
  const cancellation = job.status === "CANCELLED"
    ? await db.auditEvent.findFirst({ where: { event: "BATCH_CANCELLED", details: { path: ["batchId"], equals: id } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, details: true, actor: { select: { name: true } } } })
    : null;
  return NextResponse.json({ job: { ...job, cancellation } });
}

