"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileAttachmentField } from "@/components/file-attachment-field";
import { RefreshPageButton } from "@/components/refresh-page-button";

type SheetPreview = { name: string; headers: string[]; rows: { rowNumber: number; values: string[] }[]; rowCount: number };
type ActionMode = "single" | "spreadsheet";

export function ManualActionForm() {
  const router = useRouter();
  const [mode, setMode] = useState<ActionMode>("single");
  const [contractNumber, setContractNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [sheets, setSheets] = useState<SheetPreview[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [columnIndex, setColumnIndex] = useState("");
  const [actionType, setActionType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedSheet = sheets.find((sheet) => sheet.name === sheetName);

  async function preview(selected: File | null, includeHeader = hasHeader) {
    setFile(selected); setSheets([]); setSheetName(""); setColumnIndex(""); setError("");
    if (!selected) return;
    const form = new FormData(); form.set("file", selected); form.set("hasHeader", String(includeHeader)); setBusy(true);
    try {
      const response = await fetch("/api/batches/preview", { method: "POST", body: form });
      const data = await response.json() as { sheets?: SheetPreview[]; error?: string };
      if (!response.ok) throw new Error(data.error);
      setSheets(data.sheets || []);
      if (data.sheets?.length) { setSheetName(data.sheets[0].name); setColumnIndex("0"); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ler a planilha.");
    } finally { setBusy(false); }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!actionType) { setError("Selecione a ação DMA."); return; }
    if (mode === "single" && !contractNumber.trim()) { setError("Informe o número do contrato."); return; }
    if (mode === "spreadsheet" && (!file || !selectedSheet || columnIndex === "")) { setError("Informe a planilha, a aba e a coluna dos contratos."); return; }

    setBusy(true); setError("");
    const form = new FormData();
    form.set("actionType", actionType);
    if (mode === "single") {
      form.set("contractNumber", contractNumber.trim());
    } else {
      if (!file) { setError("Selecione uma planilha."); setBusy(false); return; }
      form.set("file", file); form.set("worksheetName", sheetName); form.set("columnIndex", columnIndex); form.set("hasHeader", String(hasHeader));
    }
    try {
      const response = await fetch("/api/batches", { method: "POST", body: form });
      const data = await response.json() as { jobId?: string; error?: string };
      if (!response.ok || !data.jobId) throw new Error(data.error || "Falha ao preparar a ação.");
      router.push(`/acoes-manuais/${data.jobId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao preparar a ação.");
    } finally { setBusy(false); }
  }

  const ready = mode === "single" ? Boolean(contractNumber.trim()) : Boolean(selectedSheet && columnIndex !== "");

  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Ação direta · fluxo V1</span>
          <h1>Ação manual DMA</h1>
          <p>Execute a ação para um contrato ou importe uma planilha.</p>
        </div>
        <div className="page-heading-actions"><RefreshPageButton /><Link className="button secondary" href="/">Voltar</Link></div>
      </header>
      <section className="panel">
        <div className="notice">A ação manual é enviada diretamente ao Coral após a confirmação. Ela não exige voucher, análise IA ou aprovação de administrador.</div>
        <form className="request-form" onSubmit={create}>
          <label className="filter-field">Ação DMA
            <select value={actionType} onChange={(event) => setActionType(event.target.value)} required>
              <option value="" disabled>Selecione a ação</option>
              <option value="CONSIDERAR_DMA">Considerar DMA</option>
              <option value="DESCONSIDERAR_DMA">Desconsiderar DMA</option>
            </select>
          </label>

          <div className="form-actions" role="group" aria-label="Tipo da ação manual">
            <button type="button" className={mode === "single" ? "button primary" : "button secondary"} aria-pressed={mode === "single"} onClick={() => { setMode("single"); setError(""); }}>Um contrato</button>
            <button type="button" className={mode === "spreadsheet" ? "button primary" : "button secondary"} aria-pressed={mode === "spreadsheet"} onClick={() => { setMode("spreadsheet"); setError(""); }}>Importar planilha</button>
          </div>

          {mode === "single" ? (
            <label className="filter-field">Número do contrato
              <input value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} maxLength={80} placeholder="Digite o número do contrato" required />
            </label>
          ) : (
            <>
              <p className="subcell">Aceita .xlsx e .csv, com limite de 1.000 contratos. Escolha se a primeira linha contém cabeçalhos.</p>
              <FileAttachmentField label="Planilha (.xlsx ou .csv)" name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" file={file} required onFileChange={(selected) => void preview(selected)} />
              <label className="spreadsheet-header-toggle"><input type="checkbox" checked={hasHeader} onChange={(event) => { const next = event.target.checked; setHasHeader(next); if (file) void preview(file, next); }} /> A primeira linha contém nomes das colunas</label>
              {busy && !sheets.length && <p className="subcell">Lendo planilha…</p>}
              {sheets.length > 0 && (
                <div className="filter-bar">
                  <label className="filter-field">Aba da planilha
                    <select value={sheetName} onChange={(event) => { setSheetName(event.target.value); setColumnIndex("0"); }} required>
                      {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rowCount} linhas</option>)}
                    </select>
                  </label>
                  <label className="filter-field">Coluna dos contratos
                    <select value={columnIndex} onChange={(event) => setColumnIndex(event.target.value)} required>
                      {selectedSheet?.headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header} (coluna {index + 1})</option>)}
                    </select>
                  </label>
                </div>
              )}
              {selectedSheet && columnIndex !== "" && (
                <>
                  {hasHeader && /^[A-Z]{2,}\d{3,}[-/]/i.test(selectedSheet.headers[Number(columnIndex)] || "") && <div className="notice">O cabeçalho selecionado parece ser um número de contrato. Se a primeira linha da planilha for um contrato, desmarque “A primeira linha contém nomes das colunas”.</div>}
                  <p className="subcell">Prévia das primeiras {selectedSheet.rows.length} linhas. Repetidos e células vazias serão ignorados.</p>
                  <div className="table-wrap"><table><thead><tr><th>Linha</th><th>Contrato escolhido</th></tr></thead><tbody>
                    {selectedSheet.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.values[Number(columnIndex)] || <em>Vazio</em>}</td></tr>)}
                  </tbody></table></div>
                </>
              )}
            </>
          )}

          {error && <div className="notice error-notice">{error}</div>}
          <button className="button primary" disabled={busy || !ready || !actionType}>{busy ? "Preparando…" : mode === "single" ? "Conferir contrato e continuar" : "Conferir contratos e continuar"}</button>
        </form>
      </section>
    </main>
  );
}
