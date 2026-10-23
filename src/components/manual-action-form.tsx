"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
type SheetPreview = { name: string; headers: string[]; rows: { rowNumber: number; values: string[] }[]; rowCount: number };
export function ManualActionForm() {
  const router = useRouter(); const [file, setFile] = useState<File | null>(null); const [sheets, setSheets] = useState<SheetPreview[]>([]); const [sheetName, setSheetName] = useState(""); const [columnIndex, setColumnIndex] = useState(""); const [actionType, setActionType] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const selectedSheet = sheets.find((sheet) => sheet.name === sheetName);
  async function preview(selected: File | null) {
    setFile(selected); setSheets([]); setSheetName(""); setColumnIndex(""); setError("");
    if (!selected) return;
    const form = new FormData(); form.set("file", selected); setBusy(true);
    try { const response = await fetch("/api/batches/preview", { method: "POST", body: form }); const data = await response.json() as { sheets?: SheetPreview[]; error?: string }; if (!response.ok) throw new Error(data.error); setSheets(data.sheets || []); if (data.sheets?.length) { setSheetName(data.sheets[0].name); setColumnIndex("0"); } }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível ler a planilha."); }
    finally { setBusy(false); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!file || columnIndex === "" || !actionType) { setError("Informe a ação, a aba e a coluna dos contratos."); return; }
    setBusy(true); setError(""); const form = new FormData(); form.set("file", file); form.set("worksheetName", sheetName); form.set("columnIndex", columnIndex); form.set("actionType", actionType);
    try { const response = await fetch("/api/batches", { method: "POST", body: form }); const data = await response.json() as { jobId?: string; error?: string }; if (!response.ok || !data.jobId) throw new Error(data.error || "Falha ao preparar a ação."); router.push(`/acoes-manuais/${data.jobId}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao preparar a ação."); }
    finally { setBusy(false); }
  }
  return <main className="shell"><header className="page-heading"><div className="page-heading-left"><span className="eyebrow">Ação direta · fluxo V1</span><h1>Ação manual por planilha</h1><p>Importe contratos e envie a ação DMA individualmente para cada linha.</p></div><Link className="button secondary" href="/">Voltar</Link></header>
    <section className="panel"><div className="notice">Este fluxo executa a ação diretamente no Coral, sem voucher, análise IA ou aprovação de administrador. Use o fluxo de solicitação individual para ações que exigem anexos e revisão.</div><form className="request-form" onSubmit={create}>
      <label className="filter-field">Ação DMA<select value={actionType} onChange={(event) => setActionType(event.target.value)} required><option value="" disabled>Selecione a ação</option><option value="CONSIDERAR_DMA">Considerar DMA</option><option value="DESCONSIDERAR_DMA">Desconsiderar DMA</option></select></label>
      <label className="filter-field">Planilha (.xlsx ou .csv)<input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => void preview(event.target.files?.[0] || null)} required /></label>
      {busy && <p className="subcell">Lendo planilha…</p>}
      {sheets.length > 0 && <div className="filter-bar"><label className="filter-field">Aba da planilha<select value={sheetName} onChange={(event) => { setSheetName(event.target.value); setColumnIndex("0"); }} required>{sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rowCount} linhas</option>)}</select></label><label className="filter-field">Coluna dos contratos<select value={columnIndex} onChange={(event) => setColumnIndex(event.target.value)} required>{selectedSheet?.headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header} (coluna {index + 1})</option>)}</select></label></div>}
      {selectedSheet && columnIndex !== "" && <><p className="subcell">Prévia das primeiras {selectedSheet.rows.length} linhas; limite de 1.000 contratos. Repetidos e células vazias serão ignorados.</p><div className="table-wrap"><table><thead><tr><th>Linha</th><th>Contrato escolhido</th></tr></thead><tbody>{selectedSheet.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.values[Number(columnIndex)] || <em>Vazio</em>}</td></tr>)}</tbody></table></div></>}
      {error && <div className="notice error-notice">{error}</div>}
      <button className="button primary" disabled={busy || !selectedSheet || !actionType}>{busy ? "Preparando…" : "Conferir contratos e continuar"}</button>
    </form></section>
  </main>;
}
