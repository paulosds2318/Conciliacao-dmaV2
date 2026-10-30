import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storageDriver } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/** Verificação do Load Balancer: responde 200 só quando o banco está acessível. Público e sem detalhes sensíveis. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", storage: storageDriver() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
