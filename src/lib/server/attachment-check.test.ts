import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_PDF_ONLY_MESSAGE, looksLikePdf } from "../attachment-rules.ts";
import { SAME_FILE_MESSAGE } from "../same-file.ts";
import { attachmentError } from "./attachment-check.ts";
import { NO_TEXT_CONTRACT_REASON, SAME_DOCUMENT_MESSAGE, VOUCHER_IS_CONTRACT_MESSAGE } from "./contract-layout.ts";

/** PDF de uma página com as linhas dadas (ASCII), para testar a leitura do texto sem arquivos reais. */
function pdf(lines: string[], name: string) {
  const text = lines.map((line, index) => `BT /F1 11 Tf 40 ${780 - index * 18} Td (${line}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([Buffer.from(out, "latin1")], name, { type: "application/pdf" });
}

const CONTRACT = [
  "Contrato: FOR700001-26 Status: Aberto Reserva: R0000001-26 Origem: Rentcars",
  "Dados da retirada Data/hora: 06/11/2026 - 11:11 Loja: FOR10 - Fortaleza Aeroporto",
  "Dados da devolucao Data/hora: 13/11/2026 - 14:11 Loja: FOR10 - Fortaleza Aeroporto",
  "Locatario / Contratante MARIA FICTICIA DE TESTE Codigo de cliente: 1",
  "Dados do veiculo Placa: AAA0A00 Chassi: 00000000000000000 Classe reservada: D",
  "Precos de locacao Valor unitario Quantidade Valor total Diaria R$ 100,00 7 R$ 700,00",
  "INFORMACOES IMPORTANTES SOBRE O CONTRATO DE LOCACAO 1. Coparticipacao (LDW)",
  "Termos e Condicoes gerais do contrato de locacao de veiculos",
];
const VOUCHER = [
  "VOUCHER - DOCUMENTO DA RESERVA Rentcars Codigo da Solicitacao Rentcars TESTE123",
  "Cliente: MARIA FICTICIA DE TESTE CPF: 111.111.111-11 Reserva Foco: R0000001-26",
  "Retirada: Fortaleza Aeroporto 06/11/2026 Devolucao: 13/11/2026 Categoria: D Valor pago: R$ 700,00",
];
const png = (name: string) =>
  new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8])], name, { type: "image/png" });

describe("attachmentError", () => {
  it("contrato no modelo padrão com um voucher de verdade: sem problema", async () => {
    assert.equal(await attachmentError({ voucher: pdf(VOUCHER, "voucher.pdf"), contract: pdf(CONTRACT, "contrato.pdf") }), null);
  });
  it("sem voucher (Considerar DMA) só o contrato é conferido", async () => {
    assert.equal(await attachmentError({ voucher: null, contract: pdf(CONTRACT, "contrato.pdf") }), null);
    assert.match((await attachmentError({ voucher: null, contract: pdf(VOUCHER, "contrato.pdf") })) ?? "", /não está no modelo padrão/);
  });
  it("o contrato só pode ser PDF", async () => {
    assert.equal(await attachmentError({ voucher: pdf(VOUCHER, "voucher.pdf"), contract: png("contrato.png") }), CONTRACT_PDF_ONLY_MESSAGE);
    const renamed = new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "contrato.pdf", { type: "application/pdf" });
    assert.equal(await attachmentError({ voucher: null, contract: renamed }), CONTRACT_PDF_ONLY_MESSAGE);
  });
  it("o contrato em PDF digitalizado, sem texto, não vale", async () => {
    assert.equal(await attachmentError({ voucher: null, contract: pdf([], "contrato.pdf") }), NO_TEXT_CONTRACT_REASON);
  });
  it("o contrato fora do modelo é recusado, com o que faltou", async () => {
    const message = await attachmentError({ voucher: pdf(VOUCHER, "voucher.pdf"), contract: pdf(CONTRACT.slice(0, 6), "contrato.pdf") });
    assert.match(message ?? "", /Não foram encontradas as seções: Informações importantes sobre o contrato de locação/);
  });
  it("o mesmo arquivo nos dois campos é barrado", async () => {
    const file = pdf(CONTRACT, "contrato.pdf");
    assert.equal(await attachmentError({ voucher: file, contract: file }), SAME_FILE_MESSAGE);
  });
  it("um contrato no campo do voucher é barrado, mesmo sendo outro arquivo (outra exportação do mesmo contrato)", async () => {
    const message = await attachmentError({
      voucher: pdf([...CONTRACT, "Gerado novamente em 07/11/2026"], "outro-contrato.pdf"),
      contract: pdf(CONTRACT, "contrato.pdf"),
    });
    assert.equal(message, VOUCHER_IS_CONTRACT_MESSAGE);
  });
  it("só a primeira página do contrato no campo do voucher é barrada, mesmo sem os textos jurídicos", async () => {
    const message = await attachmentError({
      voucher: pdf(CONTRACT.slice(0, 6), "primeira-pagina.pdf"),
      contract: pdf(CONTRACT, "contrato.pdf"),
    });
    assert.equal(message, SAME_DOCUMENT_MESSAGE);
  });
  it("voucher em imagem não tem texto para conferir aqui e passa (a análise avalia depois)", async () => {
    assert.equal(await attachmentError({ voucher: png("voucher.png"), contract: pdf(CONTRACT, "contrato.pdf") }), null);
  });
});

describe("looksLikePdf", () => {
  it("vale o tipo informado ou a extensão", () => {
    assert.equal(looksLikePdf({ name: "a.bin", type: "application/pdf" }), true);
    assert.equal(looksLikePdf({ name: "CONTRATO.PDF", type: "" }), true);
    assert.equal(looksLikePdf({ name: "foto.png", type: "image/png" }), false);
  });
});

describe("attachmentError: conferência de um anexo só, ao escolher o arquivo", () => {
  it("só o contrato: confere o modelo", async () => {
    assert.equal(await attachmentError({ voucher: null, contract: pdf(CONTRACT, "contrato.pdf") }), null);
    assert.match((await attachmentError({ voucher: null, contract: pdf(VOUCHER, "contrato.pdf") })) ?? "", /não está no modelo padrão/);
  });
  it("só o voucher: barra o contrato, deixa passar o voucher de verdade e a imagem", async () => {
    assert.equal(await attachmentError({ voucher: pdf(CONTRACT, "contrato.pdf"), contract: null }), VOUCHER_IS_CONTRACT_MESSAGE);
    assert.equal(await attachmentError({ voucher: pdf(VOUCHER, "voucher.pdf"), contract: null }), null);
    assert.equal(await attachmentError({ voucher: png("voucher.png"), contract: null }), null);
  });
  it("nenhum arquivo: nada a conferir", async () => {
    assert.equal(await attachmentError({ voucher: null, contract: null }), null);
  });
});
