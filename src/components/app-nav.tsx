"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme-toggle";
export function AppNav() {
  const session = useSession();
  const router = useRouter();
  const storedRole = (session.data?.user as { role?: string } | undefined)?.role;
  const role = storedRole === "admin" ? "admin" : "attendant";
  const canCreate = role === "attendant";
  const canManageRequests = role === "attendant";
  const isAdmin = role === "admin";
  return <nav className="app-nav"><div className="nav-left"><Link href="/" className="nav-logo-link"><Image src="/foco-logo.png" alt="Foco" width={150} height={38} className="nav-logo-img" style={{ height: 38, width: "auto" }} /></Link><span className="nav-divider"/><span className="nav-badge"><span className="nav-badge-dot"/> Conciliação DMA</span></div><div className="nav-links"><ThemeToggle />{session.data && <>{canCreate && <Link className="nav-link" href="/solicitacoes/nova">Nova solicitação</Link>}{canManageRequests && <Link className="nav-link" href="/minhas-solicitacoes">Minhas solicitações</Link>}{canCreate && <Link className="nav-link" href="/consulta-dma">Situa&ccedil;&atilde;o DMA</Link>}{isAdmin && <><Link className="nav-link" href="/acoes-manuais">Ação manual por planilha</Link><Link className="nav-link" href="/consulta-dma">Situação DMA</Link><Link className="nav-link" href="/gestao-usuarios">Gestão de usuários</Link><Link className="nav-link" href="/analise">Aprovar solicitações</Link></>}<button className="button secondary" onClick={() => signOut({ fetchOptions: { onSuccess: () => { router.replace("/login"); router.refresh(); } } })}>Sair</button></>}{!session.data && <Link className="button secondary" href="/login">Entrar</Link>}</div></nav>;
}