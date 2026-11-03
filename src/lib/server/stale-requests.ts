import { db } from "@/lib/db";

/** A análise (até 2 min) e o envio ao Coral (até 20 s) rodam em segundo plano; passado este prazo, o processo foi interrompido. */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Solicitações paradas em ANALYZING ou EXECUTING (ex.: servidor reiniciado no meio do processamento) não ficam presas:
 * a análise vira ANALYSIS_FAILED, que permite nova tentativa, e a execução vira EXECUTION_UNCERTAIN, porque o Coral pode ter aplicado a ação.
 */
export async function recoverStaleRequests(where: { id?: string; requesterId?: string } = {}) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db.dmaRequest.findMany({
    where: { ...where, status: { in: ["ANALYZING", "EXECUTING"] }, updatedAt: { lt: cutoff } },
    select: { id: true, status: true, version: true },
  });
  for (const item of stale) {
    await db.$transaction(async (tx) => {
      if (item.status === "ANALYZING") {
        const changed = await tx.dmaRequest.updateMany({
          where: { id: item.id, status: "ANALYZING", updatedAt: { lt: cutoff } },
          data: { status: "ANALYSIS_FAILED" },
        });
        if (changed.count)
          await tx.auditEvent.create({
            data: {
              requestId: item.id,
              event: "AI_ANALYSIS_FAILED",
              details: { version: item.version, message: "A análise foi interrompida antes de terminar. Tente a análise novamente." },
            },
          });
        return;
      }
      const changed = await tx.dmaRequest.updateMany({
        where: { id: item.id, status: "EXECUTING", updatedAt: { lt: cutoff } },
        data: { status: "EXECUTION_UNCERTAIN" },
      });
      if (!changed.count) return;
      await tx.executionAttempt.updateMany({
        where: { requestId: item.id, status: "IN_PROGRESS" },
        data: { status: "UNCERTAIN", errorCode: "PROCESSO_INTERROMPIDO", completedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          requestId: item.id,
          event: "CORAL_EXECUTION_UNCERTAIN",
          details: { message: "O envio ao Coral foi interrompido antes da resposta. Confira no Coral se a ação foi aplicada." },
        },
      });
    });
  }
}
