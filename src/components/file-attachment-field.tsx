"use client";
import { useId, useRef, useState } from "react";
import { useConfirmation } from "@/components/confirmation-provider";

type Props = {
  label: string;
  name: string;
  accept: string;
  file: File | null;
  required?: boolean;
  disabled?: boolean;
  onFileChange: (file: File | null) => void;
  onRemove?: (file: File) => void;
  /** Confere o arquivo assim que é escolhido. Devolve a mensagem do problema (o arquivo é descartado e a mensagem aparece abaixo do campo) ou null. */
  validate?: (file: File) => Promise<string | null>;
};

export function FileAttachmentField({
  label,
  name,
  accept,
  file,
  required = false,
  disabled = false,
  onFileChange,
  onRemove,
  validate,
}: Props) {
  const confirmAction = useConfirmation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState("");
  const [checking, setChecking] = useState(false);

  async function choose(chosen: File | null) {
    setProblem("");
    if (!chosen || !validate) {
      onFileChange(chosen);
      return;
    }
    setChecking(true);
    let message: string | null = null;
    try {
      message = await validate(chosen);
    } catch {
      // Sem conseguir conferir agora, o arquivo segue e a conferência do envio decide.
    } finally {
      setChecking(false);
    }
    if (message) {
      // O arquivo recusado não fica anexado.
      if (inputRef.current) inputRef.current.value = "";
      onFileChange(null);
      setProblem(message);
      return;
    }
    onFileChange(chosen);
  }

  async function confirmRemoval() {
    if (!file) return;
    const removedFile = file;
    const confirmed = await confirmAction({
      title: "Remover anexo?",
      description: `O arquivo "${removedFile.name}" será retirado deste envio.`,
      confirmLabel: "Remover anexo",
      danger: true,
    });
    if (!confirmed) return;
    if (inputRef.current) inputRef.current.value = "";
    onFileChange(null);
    onRemove?.(removedFile);
  }

  return (
    <div className="filter-field attachment-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        required={required && !file}
        // Selected files must remain enabled so the browser includes them in FormData.
        disabled={disabled || checking}
        aria-invalid={problem ? true : undefined}
        onChange={(event) => void choose(event.target.files?.[0] || null)}
      />
      {checking && <p className="subcell">Conferindo o arquivo…</p>}
      {problem && (
        <div className="notice error-notice" role="alert">
          {problem}
        </div>
      )}
      {file && (
        <div className="attachment-selected">
          <span title={file.name}>{file.name}</span>
          <button type="button" className="button secondary attachment-remove" onClick={() => void confirmRemoval()} disabled={disabled}>
            Remover anexo
          </button>
        </div>
      )}
    </div>
  );
}
