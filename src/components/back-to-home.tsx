"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Telas que não precisam do botão: a própria inicial e o login, que já tem o seu link de volta no cartão. */
const HIDDEN_ON = ["/", "/login"];

/** Botão "Voltar ao início" logo abaixo do menu, em todas as telas internas. */
export function BackToHome() {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;
  return (
    <div className="back-home">
      <Link className="button secondary" href="/">
        <span aria-hidden="true">←</span> Voltar ao início
      </Link>
    </div>
  );
}
