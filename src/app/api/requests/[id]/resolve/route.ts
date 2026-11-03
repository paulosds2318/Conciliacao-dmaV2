import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
type Context = { params: Promise<{ id: string }> };
/** O administrador confere no Coral e registra se uma ação com resultado não confirmado foi aplicada ou não. */
export async function POST(request: Request, { params }: Context) {
  const admin = await isAllowed(["admin"]);
  if (!admin) return apiError("Apenas administradores podem registrar o resultado conferido no Coral.", 403);
  const body = (await request.json().catch(() => null)) as { outcome?: unknown; reason?: unknown } | null;
  const outcome = body?.outcome;
  if (outcome !== "APPLIED" && outcome !== "NOT_APPLIED") return apiError("Informe se a ação foi aplicada ou não no Coral.");
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError("Descreva o que foi conferido no Coral.");
  if (reason.length > 2000) return apiError("A descrição deve ter no máximo 2.000 caracteres.");
  const { id } = await params;
  const status = outcome === "APPLIED" ? "COMPLETED" : "EXECUTION_FAILED";
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.dmaRequest.updateMany({ where: { id, status: "EXECUTION_UNCERTAIN" }, data: { status } });
      if (!changed.count) throw new Error("Esta solicitação não está com resultado pendente de confirmação.");
      await tx.auditEvent.create({
        data: { requestId: id, actorId: admin.id, event: "EXECUTION_RESULT_CONFIRMED", details: { outcome, status, reason } },
      });
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível registrar o resultado.", 409);
  }
  return NextResponse.json({ status });
}
