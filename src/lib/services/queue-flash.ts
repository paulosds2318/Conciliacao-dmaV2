/** Aviso mostrado na fila de aprovações depois de aprovar uma solicitação na tela de detalhe e voltar para a fila. */
export const QUEUE_FLASH_KEY = "dma:aviso-fila-aprovacoes";

type FlashStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeStorage(): FlashStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function approvalFlashMessage(contractName: string, forced: boolean) {
  return `Solicitação ${contractName} ${forced ? "aprovada à força" : "aprovada"} e concluída no Coral.`;
}

export function saveQueueFlash(message: string, storage: FlashStorage | undefined = safeStorage()) {
  try {
    storage?.setItem(QUEUE_FLASH_KEY, message);
  } catch {
    /* sem armazenamento: a fila abre sem o aviso */
  }
}

/** Devolve o aviso guardado e o apaga, para aparecer uma única vez. */
export function takeQueueFlash(storage: FlashStorage | undefined = safeStorage()) {
  try {
    const message = storage?.getItem(QUEUE_FLASH_KEY);
    if (!message) return null;
    storage?.removeItem(QUEUE_FLASH_KEY);
    return message;
  } catch {
    return null;
  }
}
