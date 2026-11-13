import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
export default function LoginPage() {
  return (
    <main className="login-screen">
      <header className="login-brand">
        <Image src="/foco-logo.png" alt="Foco Aluguel de Carros" width={140} height={48} priority style={{ height: "auto" }} />
        <h1>Conciliação DMA</h1>
        <p>Portal seguro de validação de solicitações</p>
      </header>
      <section className="login-card" aria-labelledby="login-title">
        <h2 id="login-title">Acessar sua conta</h2>
        <p>Insira suas credenciais corporativas</p>
        <Suspense fallback={<p>Carregando formulário…</p>}>
          <LoginForm />
        </Suspense>
        <footer className="login-card-footer">
          <span aria-hidden="true">🔒</span> Gestão centralizada · Acessos criados por administradores Foco
        </footer>
      </section>
      <Link className="button secondary" href="/">
        <span aria-hidden="true">←</span> Voltar ao início
      </Link>
    </main>
  );
}
