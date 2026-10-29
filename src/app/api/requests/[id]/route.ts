import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { correctStoredNameComparison } from "@/lib/server/openrouter";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Nao autorizado.", 401);
  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id }, include: { requester: { select: { id: true, name: true, email: true } }, documents: { orderBy: [{ version: "desc" }, { kind: "asc" }] }, analyses: { orderBy: { createdAt: "desc" } }, decisions: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { name: true, email: true } } } }, executionAttempts: { orderBy: { createdAt: "desc" } }, auditEvents: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true, email: true } } } } } });
  if (!item) return apiError("Solicitacao nao encontrada.", 404);
  if (user.role === "attendant" && item.requesterId !== user.id) return apiError("Sem acesso a esta solicitacao.", 403);
  const request = { ...item, analyses: item.analyses.map((analysis) => ({ ...analysis, comparison: correctStoredNameComparison(analysis.comparison) })) };
  return NextResponse.json({ request });
}
