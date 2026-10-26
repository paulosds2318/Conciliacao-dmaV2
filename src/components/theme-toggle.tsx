"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "conciliacao-dma-theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    const useDarkTheme = savedTheme === "dark";
    document.documentElement.dataset.theme = useDarkTheme ? "dark" : "light";
    setDark(useDarkTheme);
  }, []);

  function toggleTheme() {
    const useDarkTheme = !dark;
    document.documentElement.dataset.theme = useDarkTheme ? "dark" : "light";
    window.localStorage.setItem(STORAGE_KEY, useDarkTheme ? "dark" : "light");
    setDark(useDarkTheme);
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
