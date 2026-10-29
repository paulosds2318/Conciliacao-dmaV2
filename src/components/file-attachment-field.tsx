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
};

export function FileAttachmentField({ label, name, accept, file, required = false, disabled = false, onFileChange, onRemove }: Props) {
  const confirmAction = useConfirmation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [removedHistory, setRemovedHistory] = useState<string[]>([]);

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
    setRemovedHistory((current) => [...current, removedFile.name]);
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
        disabled={disabled}
        onChange={(event) => onFileChange(event.target.files?.[0] || null)}
      />
      {file && (
        <div className="attachment-selected">
          <span title={file.name}>{file.name}</span>
          <button type="button" className="button secondary attachment-remove" onClick={() => void confirmRemoval()} disabled={disabled}>
            Remover anexo
          </button>
        </div>
      )}
      {removedHistory.length > 0 && (
        <ul className="attachment-removal-history" aria-label="Anexos removidos">
          {removedHistory.map((removed, index) => (
            <li key={`${removed}-${index}`}>Removido após confirmação: {removed}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
