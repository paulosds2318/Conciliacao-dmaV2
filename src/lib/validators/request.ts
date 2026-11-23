import { FORCE_JUSTIFICATION_MIN_LENGTH } from "@/lib/justification";
import { z } from "zod";
export const createRequestSchema = z.object({
  actionType: z.string().trim().min(1),
  contractName: z.string().trim().min(1),
  observations: z.string().trim().max(2000).optional(),
});
/** Aprovação forçada de uma solicitação recusada: a justificativa é obrigatória e fica no histórico. */
const FORCE_JUSTIFICATION_REQUIRED = `Informe a justificativa da aprovação forçada (mínimo de ${FORCE_JUSTIFICATION_MIN_LENGTH} caracteres).`;
export const forceApprovalSchema = z.object(
  {
    justification: z
      .string({ error: FORCE_JUSTIFICATION_REQUIRED })
      .trim()
      .min(FORCE_JUSTIFICATION_MIN_LENGTH, FORCE_JUSTIFICATION_REQUIRED)
      .max(2000, "A justificativa deve ter no máximo 2.000 caracteres."),
  },
  { error: FORCE_JUSTIFICATION_REQUIRED },
);
export const reviewDecisionSchema = z
  .object({ decision: z.enum(["APPROVE", "REJECT"]), justification: z.string().trim().optional() })
  .superRefine((value, ctx) => {
    if (value.decision === "REJECT" && !value.justification)
      ctx.addIssue({ code: "custom", path: ["justification"], message: "Informe o motivo da recusa." });
  });
