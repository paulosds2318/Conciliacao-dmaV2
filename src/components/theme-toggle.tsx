"use client";

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "conciliacao-dma-theme";
const listeners = new Set<() => void>();

// O tema vive no atributo data-theme do <html>; os botões só observam esse valor.
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function readDark() { return document.documentElement.dataset.theme === "dark"; }
function applyTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  listeners.forEach((listener) => listener());
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, readDark, () => false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* armazenamento bloqueado: usa o tema claro */ }
    applyTheme(saved === "dark");
  }, []);

  function toggleTheme() {
    const useDarkTheme = !dark;
    try { window.localStorage.setItem(STORAGE_KEY, useDarkTheme ? "dark" : "light"); } catch { /* preferência só nesta visita */ }
    applyTheme(useDarkTheme);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={dark ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      <span aria-hidden="true">◐</span>
      <span className="theme-toggle-label">Tema</span>
    </button>
  );
}
