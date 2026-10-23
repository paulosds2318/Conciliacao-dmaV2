import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
export default function LoginPage() { return <main className="shell"><section className="panel login-panel"><span className="eyebrow">Acesso interno</span><h1>Entrar</h1><p>Use sua conta corporativa para acessar as solicitações.</p><Suspense fallback={<p>Carregando formulário…</p>}><LoginForm /></Suspense><Link className="nav-link" href="/">Voltar ao início</Link></section></main>; }
