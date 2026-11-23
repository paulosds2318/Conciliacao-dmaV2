import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QUEUE_FLASH_KEY, approvalFlashMessage, saveQueueFlash, takeQueueFlash } from "./queue-flash.ts";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
};

describe("aviso da fila de aprovações", () => {
  it("diz qual contrato foi aprovado e se foi aprovação forçada", () => {
    assert.equal(approvalFlashMessage("CNF011109-26", false), "Solicitação CNF011109-26 aprovada e concluída no Coral.");
    assert.equal(approvalFlashMessage("CNF011109-26", true), "Solicitação CNF011109-26 aprovada à força e concluída no Coral.");
  });
  it("aparece uma única vez", () => {
    const storage = memory();
    saveQueueFlash("aviso", storage);
    assert.equal(storage.data.get(QUEUE_FLASH_KEY), "aviso");
    assert.equal(takeQueueFlash(storage), "aviso");
    assert.equal(takeQueueFlash(storage), null);
  });
  it("sem armazenamento, não quebra", () => {
    saveQueueFlash("aviso", undefined);
    assert.equal(takeQueueFlash(undefined), null);
    const broken = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => undefined,
    };
    saveQueueFlash("aviso", broken);
    assert.equal(takeQueueFlash(broken), null);
  });
});
