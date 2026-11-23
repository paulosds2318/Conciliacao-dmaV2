/**
 * Linhas de log com marcador fixo `[ALERTA]` para os eventos que pedem atenção humana. No CloudWatch, um filtro de métrica
 * sobre esse marcador alimenta um alarme (ver docs/operacao-backup-alertas.md). Só código do evento e id da solicitação:
 * nada de nome, CPF ou texto de documento.
 */
export type AlertCode = "EXECUCAO_FALHOU" | "EXECUCAO_INCERTA" | "ANALISE_FALHOU" | "PROCESSO_INTERROMPIDO";

export function alertLine(code: AlertCode, requestId: string) {
  return `[ALERTA] ${code} solicitacao=${requestId}`;
}

export function logAlert(code: AlertCode, requestId: string) {
  console.error(alertLine(code, requestId));
}
