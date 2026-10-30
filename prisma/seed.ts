import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

const db = new PrismaClient();
const candidates = [
  { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, role: "admin", name: "Administrador DMA" },
  { email: process.env.SEED_ATTENDANT_EMAIL, password: process.env.SEED_ATTENDANT_PASSWORD, role: "attendant", name: "Atendente DMA", stores: (process.env.SEED_ATTENDANT_STORES || "").split(",").map((store) => store.trim().toUpperCase()).filter(Boolean) },
];
const users = candidates.filter((x) => x.email && x.password) as Array<{ email: string; password: string; role: string; name: string; stores?: string[] }>;
if (!users.length) throw new Error("Informe ao menos um par SEED_*_EMAIL e SEED_*_PASSWORD.");
for (const input of users) {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { role: input.role, name: input.name, ...(input.stores?.length ? { stores: input.stores } : {}) } })
    : await db.user.create({ data: { id: randomUUID(), email: input.email, name: input.name, role: input.role, emailVerified: true, stores: input.stores ?? [] } });
  const password = await hashPassword(input.password);
  await db.account.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
    create: { id: randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password },
    update: { password },
  });
  console.log(`Usuário preparado: ${input.email} (${input.role})`);
}
await db.$disconnect();
