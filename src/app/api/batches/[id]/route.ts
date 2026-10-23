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
  if (!job || (user.role !== "admin" && job.requesterId !== user.id)) return apiError("Ação manual não encontrada.", 404);
  return NextResponse.json({ job });
}
