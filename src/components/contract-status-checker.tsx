"use client";
import { useState } from "react";

type SheetPreview = { name: string; headers: string[]; rows: { rowNumber: number; values: string[] }[]; rowCount: number };
type Status = "CONSIDERAR" | "DESCONSIDERAR" | "UNKNOWN" | "ERROR" | "NOT_CHECKED";
type Result = { rowNumber: number; contractNumber: string; status: Status; sourceField?: string | null; message?: string };
const statusLabels: Record<Status, string> = { CONSIDERAR: "Considerar DMA", DESCONSIDERAR: "Desconsiderar DMA", UNKNOWN: "Situação não identificada", ERROR: "Falha na consulta", NOT_CHECKED: "Não consultado" };
function csvCell(value: string | number | null | undefined) { const text = value == null ? "" : String(value); const safe = /^[\t\r ]*[=+@-]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }
export function ContractStatusChecker() {
  const [number, setNumber] = useState(""); const [file, setFile] = useState<File | null>(null); const [sheets, setSheets] = useState<SheetPreview[]>([]); const [sheetName, setSheetName] = useState(""); const [columnIndex, setColumnIndex] = useState(""); const [results, setResults] = useState<Result[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [progress, setProgress] = useState({ done: 0, total: 0 });
  async function preview(selected: File | null) {
    setFile(selected); setSheets([]); setResults([]); setError(""); setSheetName(""); setColumnIndex("");
    if (!selected) return;
    const form = new FormData(); form.set("file", selected);
    try { const response = await fetch("/api/batches/preview", { method: "POST", body: form }); const data = await response.json() as { sheets?: SheetPreview[]; error?: string }; if (!response.ok) throw new Error(data.error || "Falha ao ler a planilha."); setSheets(data.sheets || []); if (data.sheets?.length) { setSheetName(data.sheets[0].name); setColumnIndex("0"); } }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao ler a planilha."); }
  }
  async function queryOne(contractNumber: string): Promise<Omit<Result, "rowNumber">> {
    const response = await fetch(`/api/contracts/status?number=${encodeURIComponent(contractNumber)}`);
    const data = await response.json() as { contract?: { number: string; currentDmaStatus: Status; statusSourceField: string | null }; error?: string };
    if (!response.ok || !data.contract) throw new Error(data.error || `Falha HTTP ${response.status}.`);
    return { contractNumber: data.contract.number, status: data.contract.currentDmaStatus, sourceField: data.contract.statusSourceField };
  }
  async function querySingle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResults([]); setProgress({ done: 0, total: 1 });
    try { const result = await queryOne(number.trim()); setResults([{ rowNumber: 1, ...result }]); }
    catch (reason) { const message = reason instanceof Error ? reason.message : "Falha ao consultar o Coral."; setResults([{ rowNumber: 1, contractNumber: number.trim(), status: "ERROR", message }]); setError(message); }
    finally { setBusy(false); setProgress({ done: 0, total: 0 }); }
  }
  async function querySpreadsheet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setError(""); setResults([]);
    try {
      const form = new FormData(); form.set("file", file); form.set("worksheetName", sheetName); form.set("columnIndex", columnIndex);
      const preparedResponse = await fetch("/api/contracts/status/prepare", { method: "POST", body: form });
      const prepared = await preparedResponse.json() as { contracts?: { rowNumber: number; contractNumber: string }[]; error?: string };
      if (!preparedResponse.ok || !prepared.contracts) throw new Error(prepared.error || "Não foi possível preparar os contratos.");
      const contracts = prepared.contracts; const unique = [...new Set(contracts.map((row) => row.contractNumber))]; const resultByNumber = new Map<string, Omit<Result, "rowNumber">>();
      let cursor = 0; let done = 0; let stop = false; setProgress({ done: 0, total: unique.length });
      async function worker() {
        while (cursor < unique.length && !stop) {
          const current = unique[cursor++];
          try { resultByNumber.set(current, await queryOne(current)); }
          catch (reason) {
            const message = reason instanceof Error ? reason.message : "Falha ao consultar o Coral.";
            resultByNumber.set(current, { contractNumber: current, status: "ERROR", message });
            if (/503|indisponível|indisponivel/i.test(message)) stop = true;
          }
          done++; setProgress({ done, total: unique.length });
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, unique.length) }, () => worker()));
      setResults(contracts.map((row) => ({ rowNumber: row.rowNumber, ...(resultByNumber.get(row.contractNumber) || { contractNumber: row.contractNumber, status: "NOT_CHECKED", message: "Consulta interrompida após falha do Coral." }) })));
      if (stop) setError("O Coral retornou indisponibilidade. As consultas restantes foram interrompidas para evitar novas chamadas durante a falha.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao processar a planilha."); }
    finally { setBusy(false); }
  }
  function downloadCsv() {
    const rows = [["Linha", "Contrato", "Situação DMA", "Campo de origem", "Detalhe"], ...results.map((row) => [String(row.rowNumber), row.contractNumber, statusLabels[row.status], row.sourceField || "", row.message || ""])];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `consulta-status-dma-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  const selectedSheet = sheets.find((sheet) => sheet.name === sheetName);
  return <main className="shell"><header className="page-heading"><div className="page-heading-left"><span className="eyebrow">Consulta no Coral</span><h1>Situação atual do DMA</h1><p>Consulte um contrato ou carregue uma planilha com vários contratos.</p></div></header>
    <section className="panel"><h2>Consultar um contrato</h2><form className="request-form" onSubmit={querySingle}><label className="filter-field">Número do contrato<input value={number} onChange={(event) => setNumber(event.target.value)} required maxLength={80} /></label><button className="button primary" disabled={busy || !number.trim()}>{busy ? "Consultando…" : "Consultar situação"}</button></form></section>
    <section className="panel"><h2>Importar contratos</h2><p className="subcell">Aceita .xlsx e .csv, até 1.000 linhas. A planilha deve conter cabeçalho na primeira linha.</p><form className="request-form" onSubmit={querySpreadsheet}><label className="filter-field">Planilha de contratos<input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => void preview(event.target.files?.[0] || null)} required /></label>{sheets.length > 0 && <div className="filter-bar"><label className="filter-field">Aba<select value={sheetName} onChange={(event) => setSheetName(event.target.value)}>{sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}</select></label><label className="filter-field">Coluna dos contratos<select value={columnIndex} onChange={(event) => setColumnIndex(event.target.value)}>{selectedSheet?.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}</select></label></div>}{selectedSheet && <p className="subcell">{selectedSheet.rowCount} linhas encontradas. Prévia: {selectedSheet.rows.slice(0, 3).map((row) => row.values[Number(columnIndex)] || "(vazio)").join(", ")}</p>}<button className="button primary" disabled={busy || !file || !sheetName || columnIndex === ""}>{busy ? `Consultando ${progress.done}/${progress.total}…` : "Consultar planilha no Coral"}</button></form></section>
    {error && <div className="notice error-notice">{error}</div>}{results.length > 0 && <section className="panel"><div className="panel-head"><div><h2>Resultado da consulta</h2><p>{results.length} linhas consultadas. Baixe o relatório para salvar os resultados.</p></div><button className="button secondary" onClick={downloadCsv}>Baixar CSV</button></div><div className="table-wrap"><table><thead><tr><th>Linha</th><th>Contrato</th><th>Situação atual</th><th>Campo retornado</th><th>Detalhe</th></tr></thead><tbody>{results.map((row, index) => <tr key={`${row.rowNumber}-${row.contractNumber}-${index}`}><td>{row.rowNumber}</td><td className="strong">{row.contractNumber}</td><td>{statusLabels[row.status]}</td><td>{row.sourceField || "—"}</td><td>{row.message || "—"}</td></tr>)}</tbody></table></div></section>}
  </main>;
}