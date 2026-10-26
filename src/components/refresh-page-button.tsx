"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshPageButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function refreshPage() {
    if (refreshing) return;
    setRefreshing(true);
    window.dispatchEvent(new Event("app:refresh"));
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 900);
  }

  return (
    <button type="button" className="button secondary refresh-icon-button" onClick={refreshPage} title="Atualizar dados" aria-label="Atualizar dados" disabled={refreshing}>
      <svg className={refreshing ? "spin" : undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.6 9a7 7 0 0 1 11.55-2L20 12M4 12l2.85 5a7 7 0 0 0 11.55-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
