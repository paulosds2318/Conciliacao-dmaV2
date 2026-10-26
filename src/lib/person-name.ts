const genericRoleNames = /^(?:administrador|admin|analista|atendente)(?:\s+dma)?$/i;

export function personName(name?: string | null, email?: string | null) {
  const cleanName = name?.trim();
  if (cleanName && !genericRoleNames.test(cleanName)) return cleanName;
  const localPart = email?.trim().split("@")[0];
  if (!localPart) return cleanName || "Usuário";
  const formatted = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
  return formatted || cleanName || "Usuário";
}
