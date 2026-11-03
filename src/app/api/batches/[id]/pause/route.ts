import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
type Context = { params: Promise<{ id: string }> };
/** Pede a pausa: o contrato em envio termina e o processamento para antes do próximo. */
export async function POST(_request: Request, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  const paused = await db.bulkActionJob.updateMany({ where: { id, deletedAt: null, status: "RUNNING" }, data: { status: "PAUSED" } });
  if (!paused.count) return apiError("Esta planilha não está em andamento.", 409);
  return NextResponse.json({ status: "PAUSED" });
}
