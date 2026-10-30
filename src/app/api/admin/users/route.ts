import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { STORES } from "@/lib/stores";
const schema = z.object({ name: z.string().trim().min(2).max(100), email: z.email(), password: z.string().min(10).max(128), role: z.enum(["attendant", "admin"]), stores: z.array(z.enum(STORES)).default([]) })
  .refine((data) => data.role === "admin" || data.stores.length > 0, { message: "Selecione ao menos uma loja para o atendente.", path: ["stores"] });
export async function GET() {
  if (!await isAllowed(["admin"])) return apiError("Apenas administradores podem gerenciar usuários.", 403);
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, banned: true, stores: true, createdAt: true } });
  return NextResponse.json({ users: users.map((user) => ({ ...user, role: user.role === "admin" ? "admin" : "attendant" })) });
}
export async function POST(request: NextRequest) {
  if (!await isAllowed(["admin"])) return apiError("Apenas administradores podem criar usuários.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Dados de usuário inválidos.");
  try {
    const { stores, ...account } = parsed.data;
    const result = await auth.api.createUser({ headers: await headers(), body: { ...account, email: account.email.trim().toLowerCase(), data: { emailVerified: true } } });
    const savedStores = account.role === "admin" ? [] : [...new Set(stores)];
    await db.user.update({ where: { id: result.user.id }, data: { stores: savedStores } });
    return NextResponse.json({ user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role, banned: result.user.banned, stores: savedStores } }, { status: 201 });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Não foi possível criar o usuário.", 400); }
}