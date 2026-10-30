import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { sanitizeStores } from "@/lib/stores";
type Context = { params: Promise<{ id: string }> };
type ActionBody = { action?: unknown; role?: unknown; name?: unknown; stores?: unknown };
export async function PATCH(request: NextRequest, { params }: Context) {
  const administrator = await isAllowed(["admin"]);
  if (!administrator) return apiError("Apenas administradores podem gerenciar usuários.", 403);
  const { id } = await params;
  const target = await db.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, banned: true } });
  if (!target) return apiError("Usuário não encontrado.", 404);
  const body = await request.json().catch(() => null) as ActionBody | null;
  if (!body) return apiError("Informe a operação de gestão.");
  const requestHeaders = await headers();
  try {
    if (body.action === "role") {
      if (id === administrator.id) return apiError("Não é permitido alterar o próprio perfil de administrador.", 409);
      if (body.role !== "admin" && body.role !== "attendant") return apiError("Selecione um perfil válido.");
      if (target.role === "admin" && !target.banned && body.role !== "admin" && await db.user.count({ where: { role: "admin", banned: false } }) <= 1) return apiError("Não é possível rebaixar o último administrador ativo.", 409);
      const result = await auth.api.setRole({ headers: requestHeaders, body: { userId: id, role: body.role } });
      return NextResponse.json({ user: { id: result.user.id, name: result.user.name, role: result.user.role } });
    }
    if (body.action === "stores") {
      const stores = sanitizeStores(body.stores);
      if (target.role !== "admin" && !stores.length) return apiError("Selecione ao menos uma loja para o atendente.");
      const updated = await db.user.update({ where: { id }, data: { stores }, select: { id: true, name: true, stores: true } });
      return NextResponse.json({ user: updated });
    }
    if (body.action === "name") {
      if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100) return apiError("O nome deve ter entre 2 e 100 caracteres.");
      const result = await auth.api.adminUpdateUser({ headers: requestHeaders, body: { userId: id, data: { name: body.name.trim() } } });
      return NextResponse.json({ user: { id: result.id, name: result.name } });
    }
    if (body.action === "ban" || body.action === "unban") {
      if (id === administrator.id && body.action === "ban") return apiError("Não é permitido desativar o próprio usuário.", 409);
      if (body.action === "ban" && target.role === "admin" && !target.banned && await db.user.count({ where: { role: "admin", banned: false } }) <= 1) return apiError("Não é possível desativar o último administrador ativo.", 409);
      const result = body.action === "ban" ? await auth.api.banUser({ headers: requestHeaders, body: { userId: id, banReason: "Desativado pelo administrador" } }) : await auth.api.unbanUser({ headers: requestHeaders, body: { userId: id } });
      return NextResponse.json({ user: { id: result.user.id, name: result.user.name, banned: result.user.banned } });
    }
    return apiError("Operação de gestão inválida.");
  } catch (error) { return apiError(error instanceof Error ? error.message : "Não foi possível atualizar o usuário.", 400); }
}