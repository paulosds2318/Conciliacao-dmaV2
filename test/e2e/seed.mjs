// Dados FICTÍCIOS dos testes de tela. Roda DENTRO do container do app (o runner copia e executa este arquivo).
// Cria dois usuários de teste (@local.test) e três solicitações: q1 (aprovável), q2 (sem id do Coral: dá erro) e q3 (recusada).
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) throw new Error("Defina E2E_PASSWORD.");
const db = new PrismaClient();

async function user(email, name, role, stores = []) {
  const existing = await db.user.findUnique({ where: { email } });
  const row = existing ?? (await db.user.create({ data: { id: randomUUID(), email, name, role, emailVerified: true, stores } }));
  if (stores.length) await db.user.update({ where: { id: row.id }, data: { stores } });
  await db.account.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: row.id } },
    create: { id: randomUUID(), accountId: row.id, providerId: "credential", userId: row.id, password: await hashPassword(PASSWORD) },
    update: { password: await hashPassword(PASSWORD) },
  });
  return row;
}
await user("teste.admin@local.test", "Admin de Teste", "admin");
const attendant = await user("teste.atendente@local.test", "Atendente de Teste", "attendant", ["FOR10"]);

const comparison = {
  matches: true,
  confidence: 0.93,
  summary: "Dados conferem.",
  voucherOrigin: "Booking",
  voucherTextAvailable: false,
  contractNumber: { expected: "ok", found: "ok", match: true },
  identity: {
    nameMatch: true,
    cpfMatch: true,
    voucher: { name: "NOME FICTICIO", cpf: "000.000.000-00" },
    contract: { name: "NOME FICTICIO", cpf: "000.000.000-00" },
  },
  fields: [],
};
const rows = [
  ["q1", "FOR710001-26", "PENDING_REVIEW", "id-q1"],
  ["q2", "FOR710002-26", "PENDING_REVIEW", null],
  ["q3", "FOR710003-26", "REJECTED", "id-q3"],
];
for (const [id, contractName, status, coralContractId] of rows) {
  const when = new Date(Date.now() - 5 * 60_000);
  await db.dmaRequest.create({
    data: {
      id,
      requesterId: attendant.id,
      actionType: "DESCONSIDERAR_DMA",
      contractName,
      coralContractId,
      status,
      version: 1,
      submittedAt: when,
      createdAt: when,
      observations: "Solicitação fictícia de teste.",
    },
  });
  await db.aiAnalysis.create({
    data: {
      requestId: id,
      requestVersion: 1,
      provider: "openrouter",
      model: "teste",
      status: status === "REJECTED" ? "AUTO_REJECTED" : "COMPLETED",
      confidence: 0.93,
      createdAt: when,
      comparison,
    },
  });
  if (status === "REJECTED")
    await db.auditEvent.create({
      data: {
        requestId: id,
        event: "AI_AUTO_REJECTED",
        details: { version: 1, reasons: ["CPF do cliente ausente ou ilegível no voucher. No contrato consta: “111.111.111-11”."] },
      },
    });
}
console.log("seed ok");
await db.$disconnect();
