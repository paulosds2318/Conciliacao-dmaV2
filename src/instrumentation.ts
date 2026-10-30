/**
 * Roda uma vez ao iniciar o servidor. Em produção, impede a aplicação de subir com configuração
 * insegura ou incompleta, em vez de falhar silenciosamente com valores de desenvolvimento.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const missing = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"].filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Configuracao obrigatoria ausente: ${missing.join(", ")}.`);
  if ((process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32) throw new Error("BETTER_AUTH_SECRET deve ter ao menos 32 caracteres.");
  if (process.env.REQUIRE_DOCUMENT_BUCKET === "true" && !process.env.DOCUMENT_STORAGE_BUCKET?.trim()) {
    throw new Error("DOCUMENT_STORAGE_BUCKET e obrigatorio neste ambiente: os documentos nao podem ficar no disco do container.");
  }
  if (process.env.MODO_TESTE_API === "true") console.warn("[config] MODO_TESTE_API=true: as acoes no Coral estao SIMULADAS.");
}
