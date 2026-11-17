import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NO_TEXT_CONTRACT_REASON,
  SAME_DOCUMENT_MESSAGE,
  VOUCHER_IS_CONTRACT_MESSAGE,
  contractLayoutReasons,
  looksLikeFocoContract,
  missingContractSections,
  sameDocumentText,
  voucherDuplicatesContractReasons,
  voucherIsContractReasons,
} from "./contract-layout.ts";

/** Estrutura do contrato padrão da Foco, com dados fictícios. */
const STANDARD = `
Contrato: ABC012345-26 Status: Aberto Reserva: R0000001-26 Confirmação: XXXX_00 Tarifa: WEB Origem: Rentcars
Dados da retirada Data/hora: 06/11/2026 - 11:11 Loja: ABC10 - Cidade Rua Exemplo, nº 1
Dados da devolução Data/hora: 13/11/2026 - 14:11 Loja: ABC10 - Cidade Rua Exemplo, nº 1
Locatário / Contratante NOME FICTICIO DA SILVA Código de cliente: 1 Nº do doc.: 00000000000
Endereço Rua Exemplo, 1 Cidade
Dados do veículo Placa: AAA0A00 Modelo: - Chassi: 00000000000000000
Preços de locação Valor unitário Quantidade Valor total Descontos (%) Valor líquido Diária R$ 100,00 7 R$ 700,00
Pagamentos Data Tipo Parcelas Número Valor
INFORMAÇÕES IMPORTANTES SOBRE O CONTRATO DE LOCAÇÃO 1. Coparticipação (LDW) Nos contratos com proteção LDW
Termos e Condições gerais do contrato de locação de veículos
Foco Aluguel de Carros — Site: www.aluguefoco.com.br
`;
/** Confirmação de reserva: cabeçalho e dados parecidos com os do contrato, mas sem os textos jurídicos. */
const RESERVATION_CONFIRMATION = `
Contrato: ABC012345-26 Status: Reservado Reserva: R0000001-26 Origem: Rentcars
Dados da retirada Data/hora: 06/11/2026 - 11:11 Dados da devolução Data/hora: 13/11/2026 - 14:11
Locatário / Contratante NOME FICTICIO DA SILVA Dados do veículo Classe reservada: D Preços de locação Total R$ 700,00
`;

describe("missingContractSections", () => {
  it("o contrato padrão não tem nada faltando", () => {
    assert.deepEqual(missingContractSections(STANDARD), []);
  });
  it("tolera quebras de linha e espaços no meio dos títulos, e a falta de acentos", () => {
    const text = STANDARD.replace("Dados da retirada", "Dados da\nretirada")
      .replace("Dados da devolução", "DADOS  DA DEVOLUCAO")
      .replace("Locatário / Contratante", "Locatario/Contratante");
    assert.deepEqual(missingContractSections(text), []);
  });
  it("aponta as seções que não aparecem", () => {
    const text = STANDARD.replace("Dados do veículo", "Veículo").replace("Preços de locação", "Valores");
    assert.deepEqual(missingContractSections(text), ["Dados do veículo", "Preços de locação"]);
  });
  it("exige os textos jurídicos: só a primeira página do contrato não basta", () => {
    const firstPageOnly = STANDARD.slice(0, STANDARD.indexOf("INFORMAÇÕES IMPORTANTES"));
    assert.deepEqual(missingContractSections(firstPageOnly), [
      "Informações importantes sobre o contrato de locação",
      "Termos e Condições gerais do contrato de locação",
    ]);
  });
  it("um voucher de parceiro não passa como contrato", () => {
    const voucher =
      "Voucher de locação Booking.com Main driver: John Smith Confirmation number: 123456789 Pickup location: Rio de Janeiro Drop-off";
    assert.equal(missingContractSections(voucher).length, 8);
  });
  it("sem a linha do número do contrato, falta o cabeçalho", () => {
    assert.deepEqual(missingContractSections(STANDARD.replace("Contrato: ABC012345-26", "Documento: ABC012345-26")), [
      "Número do contrato (Contrato: AAA000000-00)",
    ]);
  });
});

describe("contractLayoutReasons", () => {
  it("PDF com texto no modelo padrão: sem motivo", () => {
    assert.deepEqual(contractLayoutReasons(STANDARD), []);
  });
  it("PDF com texto fora do modelo: recusa e lista o que falta", () => {
    const [text] = contractLayoutReasons(STANDARD.replace("Dados do veículo", "Veículo"));
    assert.match(text, /^O contrato anexado não está no modelo padrão da Foco\. Não foram encontradas as seções: Dados do veículo\./);
    assert.match(text, /Anexe o contrato de locação padrão da Foco, sem alterações\.$/);
  });
  it("sem texto (imagem ou PDF digitalizado) não dá para conferir e por isso não vale", () => {
    assert.deepEqual(contractLayoutReasons(null), [NO_TEXT_CONTRACT_REASON]);
    assert.match(NO_TEXT_CONTRACT_REASON, /digitalizado ou fotografado/);
  });
});

describe("looksLikeFocoContract", () => {
  it("reconhece o contrato completo e também um contrato com seções de dados faltando", () => {
    assert.equal(looksLikeFocoContract(STANDARD), true);
    assert.equal(looksLikeFocoContract(STANDARD.replace("Dados do veículo", "").replace("Preços de locação", "")), true);
  });
  it("não confunde com a confirmação de reserva nem com um voucher de parceiro", () => {
    assert.equal(looksLikeFocoContract(RESERVATION_CONFIRMATION), false);
    assert.equal(looksLikeFocoContract("VOUCHER - DOCUMENTO DA RESERVA Código da Solicitação Rentcars NKGBEWW Cliente: Fulano"), false);
  });
  it("só os textos jurídicos, sem os dados do contrato, não bastam", () => {
    assert.equal(looksLikeFocoContract("Termos e Condições gerais do contrato de locação de veículos"), false);
  });
});

describe("voucherIsContractReasons", () => {
  it("voucher em PDF com texto: decide o texto, não a IA", () => {
    assert.deepEqual(voucherIsContractReasons({ text: STANDARD, ai: false }), [VOUCHER_IS_CONTRACT_MESSAGE]);
    assert.deepEqual(voucherIsContractReasons({ text: RESERVATION_CONFIRMATION, ai: true }), []);
  });
  it("voucher em imagem ou PDF digitalizado: decide a IA, e a dúvida não recusa", () => {
    assert.deepEqual(voucherIsContractReasons({ text: null, ai: true }), [VOUCHER_IS_CONTRACT_MESSAGE]);
    assert.deepEqual(voucherIsContractReasons({ text: null, ai: false }), []);
    assert.deepEqual(voucherIsContractReasons({ text: null, ai: null }), []);
    assert.deepEqual(voucherIsContractReasons({ text: null }), []);
  });
  it("a mensagem diz onde anexar cada documento", () => {
    assert.match(VOUCHER_IS_CONTRACT_MESSAGE, /campo Voucher/);
    assert.match(VOUCHER_IS_CONTRACT_MESSAGE, /campo Contrato/);
  });
});

describe("sameDocumentText", () => {
  const firstPage = STANDARD.slice(0, STANDARD.indexOf("Pagamentos"));
  it("o mesmo texto, outra exportação e só a primeira página contam como o mesmo documento", () => {
    assert.equal(sameDocumentText(STANDARD, STANDARD), true);
    assert.equal(sameDocumentText(STANDARD + " Gerado novamente em 07/11/2026", STANDARD), true);
    assert.equal(sameDocumentText(firstPage, STANDARD), true);
    assert.equal(sameDocumentText(STANDARD, firstPage), true);
  });
  it("ignora acentos, maiúsculas e quebras de linha", () => {
    assert.equal(sameDocumentText(STANDARD.toUpperCase().split(" ").join(" \t "), STANDARD), true);
  });
  it("um voucher de verdade não está contido no contrato", () => {
    const voucher =
      "VOUCHER - DOCUMENTO DA RESERVA Rentcars Código da Solicitação Rentcars TESTE123 Cliente: NOME FICTICIO DA SILVA CPF: 000.000.000-00 Reserva Foco: R0000001-26 Retirada: Cidade 06/11/2026 Devolução: 13/11/2026 Categoria: D Valor pago antecipadamente: R$ 700,00 Pagamento confirmado pela agência de viagens parceira.";
    assert.equal(sameDocumentText(voucher, STANDARD), false);
    assert.equal(sameDocumentText(RESERVATION_CONFIRMATION, STANDARD), false);
  });
  it("textos curtos demais não casam por acaso", () => {
    assert.equal(sameDocumentText("Contrato: ABC012345-26", STANDARD), false);
  });
});

describe("voucherDuplicatesContractReasons", () => {
  it("recusa quando o voucher é cópia ou parte do contrato", () => {
    assert.deepEqual(voucherDuplicatesContractReasons({ voucherText: STANDARD, contractText: STANDARD }), [SAME_DOCUMENT_MESSAGE]);
    assert.match(SAME_DOCUMENT_MESSAGE, /campo Voucher/);
  });
  it("sem texto em um dos lados não há como comparar, e não recusa por este motivo", () => {
    assert.deepEqual(voucherDuplicatesContractReasons({ voucherText: null, contractText: STANDARD }), []);
    assert.deepEqual(voucherDuplicatesContractReasons({ voucherText: STANDARD, contractText: null }), []);
  });
});
