/**
 * Voucher e contrato não podem ser o mesmo arquivo: com o mesmo documento nos dois campos, a análise cruzaria o contrato
 * com ele mesmo, sempre "conferiria" e a solicitação passaria sem nenhum voucher. Roda no navegador (aviso imediato) e no
 * servidor (que é quem garante a regra).
 */
export const SAME_FILE_MESSAGE =
  "O voucher e o contrato são o mesmo arquivo. Anexe o voucher da reserva no campo Voucher e o contrato de locação no campo Contrato. Se os dois vierem juntos no mesmo PDF, separe-os em dois arquivos.";

/** Mesmo conteúdo, mesmo com nome diferente. O tamanho já descarta quase tudo; só então compara o hash dos bytes. */
export async function sameContent(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const subtle = globalThis.crypto?.subtle;
  // Navegador sem Web Crypto (página fora de HTTPS): a conferência fica por conta do servidor.
  if (!subtle) return false;
  const [first, second] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const [hashA, hashB] = await Promise.all([subtle.digest("SHA-256", first), subtle.digest("SHA-256", second)]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  return bytesA.every((value, index) => value === bytesB[index]);
}
