import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import { ConfirmationProvider } from "@/components/confirmation-provider";
import "./globals.css";

export const viewport: Viewport = { themeColor: "#F20000", width: "device-width", initialScale: 1 };
export const metadata: Metadata = { title: "Conciliação DMA | Foco Aluguel de Carros", description: "Solicitações e validação de ações de contratos", icons: { icon: "/foco-icon.png", shortcut: "/foco-icon.png" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hasCoralAuth = Boolean(
    process.env.CORAL_AUTH_TOKEN?.trim() ||
    (process.env.CORAL_USERNAME?.trim() && process.env.CORAL_PASSWORD?.trim()),
  );
  const coralState = process.env.MODO_TESTE_API === "true"
    ? "test"
    : hasCoralAuth && process.env.CORAL_API_URL?.trim()
      ? "integrated"
      : "not-configured";

  return <html lang="pt-BR"><body><ConfirmationProvider><AppNav coralState={coralState} />{children}</ConfirmationProvider></body></html>;
}
