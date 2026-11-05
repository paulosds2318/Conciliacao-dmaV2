// Resolve o alias "@/..." do tsconfig para src/... nos testes rodados com node --test.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = fileURLToPath(new URL("../../src/", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = src + specifier.slice(2);
    const file = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => existsSync(candidate));
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
