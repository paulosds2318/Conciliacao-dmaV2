"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { personName } from "@/lib/person-name";

type CoralIntegrationState = "integrated" | "test" | "not-configured";

export function AppNav({ coralState }: { coralState: CoralIntegrationState }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const user = session.data?.user;
  const storedRole = (user as { role?: string } | undefined)?.role;
  const role = storedRole === "admin" ? "admin" : "attendant";
  const canCreate = role === "attendant";
  const isAdmin = role === "admin";
  const links = canCreate
    ? [
        { href: "/solicitacoes/nova", label: "Nova solicitação" },
        { href: "/minhas-solicitacoes", label: "Minhas solicitações" },
        { href: "/consulta-dma", label: "Situação DMA" },
      ]
    : [
        { href: "/analise", label: "Aprovar solicitações" },
        { href: "/acoes-manuais", label: "Ação manual por planilha" },
        { href: "/consulta-dma", label: "Situação DMA" },
        { href: "/gestao-usuarios", label: "👥 Gestão de usuários" },
      ];
  const roleLabel = isAdmin ? "Perfil Administrador" : "Perfil Atendente";
  const coralLabel = coralState === "integrated"
    ? "Coral Integrado"
    : coralState === "test"
      ? "Coral em teste"
      : "Coral não configurado";
  const coralDescription = coralState === "integrated"
    ? "Credenciais e endpoint de ação configurados. A disponibilidade é confirmada ao consultar ou executar uma ação."
    : coralState === "test"
      ? "Modo de teste ativo: as ações DMA são simuladas."
      : "Configure a autenticação e o endpoint de ação do Coral.";

  return (
    <nav className="app-nav" aria-label="Navegação principal">
      <div className="nav-left">
        <Link href="/" className="nav-logo-link" title="Foco Aluguel de Carros">
          <Image src="/foco-logo.png" alt="Foco" width={100} height={34} className="nav-logo-img" style={{ height: 34, width: 100 }} />
        </Link>
        <span className="nav-divider" />
        <span className="nav-badge"><span className="nav-badge-dot" />Conciliação DMA</span>
      </div>
      {session.data ? <>
        <div className="nav-links">
          {links.map((link) => <Link key={link.href} className={`nav-link ${pathname === link.href || pathname.startsWith(`${link.href}/`) ? "active" : ""}`} href={link.href}>{link.label}</Link>)}
        </div>
        <div className="nav-right nav-account">
          <ThemeToggle />
          <div className="nav-user"><span className="nav-user-name">{personName(user?.name, user?.email)}</span><span className={`nav-user-role ${isAdmin ? "admin" : ""}`}>{roleLabel}</span></div>
          <button className="button secondary nav-signout" onClick={() => signOut({ fetchOptions: { onSuccess: () => { router.replace("/login"); router.refresh(); } } })}>Sair</button>
          <span className={`coral-tag coral-tag-${coralState}`} title={coralDescription} aria-label={coralLabel}>
            <span className="coral-tag-dot" aria-hidden="true" />
            {coralLabel}
          </span>
        </div>
      </> : <div className="nav-right"><ThemeToggle /><Link className="button secondary" href="/login">Entrar</Link></div>}
    </nav>
  );
}
