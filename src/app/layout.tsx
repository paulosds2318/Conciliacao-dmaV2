import type { Metadata, Viewport } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";
export const viewport: Viewport = { themeColor: "#F20000", width: "device-width", initialScale: 1 };
export const metadata: Metadata = { title: "Concilia\u00e7\u00e3o DMA | Foco Aluguel de Carros", description: "Solicita\u00e7\u00f5es e valida\u00e7\u00e3o de a\u00e7\u00f5es de contratos", icons: { icon: "/foco-icon.png", shortcut: "/foco-icon.png" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><AppNav />{children}</body></html>;
}
