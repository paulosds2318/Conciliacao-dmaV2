import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DocumentComparison } from "../integrations/openrouter.ts";
import {
  autoApprovalEnabled,
  detectPartnerFromText,
  getContractNumberRejectionReasons,
  getIdentityRejectionReasons,
  isAutoApprovalOrigin,
  isPartnerAutoApprovable,
} from "./identity-check.ts";

/** Voucher Rentcars em PDF com texto, contrato certo e cliente conferido: o caso que passa direto. */
function approvable(overrides: Partial<DocumentComparison> = {}): DocumentComparison {
  return {
    matches: true,
    confidence: 0.95,
    contractNumber: { expected: "REC001097-26", found: "REC001097-26", match: true },
    reservation: { voucher: "R0245293-24", contract: "R0245293-24", match: true },
    identity: {
      voucher: { name: "Kerollen Santana", cpf: "113.743.374-47" },
      contract: { name: "KEROLLEN SANTANA", cpf: "11374337447" },
      cpfMatch: true,
      nameMatch: true,
    },
    voucherTextAvailable: true,
    voucherTextOrigin: "Rentcars",
    voucherOrigin: null,
    voucherBrands: [],
    fields: [],
    summary: "",
    ...overrides,
  };
}

describe("isAutoApprovalOrigin", () => {
  it("aceita Rentalcars e Rentcars em qualquer grafia", () => {
    for (const origin of ["RentalCars", "Rentalcars.com", "rentcars", "Rentcars.com"])
      assert.equal(isAutoApprovalOrigin(origin), true, origin);
  });
  it("recusa marcas parecidas e outros parceiros", () => {
    for (const origin of ["Gotrentalcars", "GotRentalCars.com / BSP Auto", "RentingCarz", "RentalCover", "Decolar", "", null, undefined])
      assert.equal(isAutoApprovalOrigin(origin), false, String(origin));
  });
});

describe("detectPartnerFromText", () => {
  it("lê a origem da Confirmação de Reserva Foco", () => {
    assert.equal(
      detectPartnerFromText("Código da reserva: R1341640-25 Locatário: Murilo Pinter Origem: RentalCars Retirada"),
      "RentalCars",
    );
    assert.equal(detectPartnerFromText("Contrato: BPS003956-26 Origem: Rentcars Dados da retirada"), "Rentcars");
  });
  it("devolve o parceiro informado quando é outro", () => {
    assert.equal(detectPartnerFromText("Origem: Decolar Dados da retirada"), "Decolar");
  });
  it("reconhece o voucher da Rentcars", () => {
    assert.equal(detectPartnerFromText("VOUCHER - DOCUMENTO DA RESERVA Código da Solicitação Rentcars NKGBEWW"), "Rentcars");
    assert.equal(detectPartnerFromText("Voucher da Reserva | Rentcars"), "Rentcars");
  });
  it("ignora citações soltas, como as apólices da RentalCover", () => {
    assert.equal(detectPartnerFromText("RentalCover.com Bilhete de seguro. O Premium foi faturado por rentcars.com."), null);
    assert.equal(detectPartnerFromText("Gotrentalcars / BSP Auto Reference : R1537688-25"), null);
  });
});

describe("isPartnerAutoApprovable", () => {
  it("aprova voucher Rentcars com contrato e cliente conferidos", () => {
    assert.equal(isPartnerAutoApprovable(approvable()), true);
  });
  it("com texto no PDF, decide pelo texto mesmo que a IA diga outra coisa", () => {
    assert.equal(isPartnerAutoApprovable(approvable({ voucherTextOrigin: "Decolar", voucherOrigin: "Rentcars" })), false);
    assert.equal(isPartnerAutoApprovable(approvable({ voucherTextOrigin: null, voucherBrands: ["Rentcars.com"] })), false);
  });
  it("sem texto (imagem ou escaneado), usa a origem lida pela IA", () => {
    assert.equal(
      isPartnerAutoApprovable(approvable({ voucherTextAvailable: false, voucherTextOrigin: null, voucherOrigin: "RentalCars" })),
      true,
    );
    assert.equal(
      isPartnerAutoApprovable(
        approvable({
          voucherTextAvailable: false,
          voucherTextOrigin: null,
          voucherOrigin: "GotRentalCars.com / BSP Auto",
          voucherBrands: ["Rentcars"],
        }),
      ),
      false,
    );
  });
  it("sem texto e sem origem da IA, aceita o parceiro entre as marcas citadas", () => {
    assert.equal(
      isPartnerAutoApprovable(
        approvable({ voucherTextAvailable: false, voucherTextOrigin: null, voucherOrigin: null, voucherBrands: ["Rentcars"] }),
      ),
      true,
    );
  });
  it("não aprova quando o contrato anexado não é o validado no Coral", () => {
    assert.equal(
      isPartnerAutoApprovable(approvable({ contractNumber: { expected: "REC001097-26", found: "REC009999-26", match: false } })),
      false,
    );
    assert.equal(isPartnerAutoApprovable(approvable({ contractNumber: { expected: "REC001097-26", found: null, match: null } })), false);
  });
  it("não aprova com qualquer divergência de CPF, nome ou reserva", () => {
    const base = approvable();
    assert.equal(isPartnerAutoApprovable(approvable({ identity: { ...base.identity, cpfMatch: false } })), false);
    assert.equal(isPartnerAutoApprovable(approvable({ identity: { ...base.identity, nameMatch: false } })), false);
    assert.equal(
      isPartnerAutoApprovable(approvable({ reservation: { voucher: "R0245293-24", contract: "R0000001-24", match: false } })),
      false,
    );
  });
  it("exige CPF ou nome conferido", () => {
    const base = approvable();
    assert.equal(isPartnerAutoApprovable(approvable({ identity: { ...base.identity, cpfMatch: null, nameMatch: true } })), true);
    assert.equal(isPartnerAutoApprovable(approvable({ identity: { ...base.identity, cpfMatch: null, nameMatch: null } })), false);
  });
});

describe("autoApprovalEnabled", () => {
  it("fica ligada por padrão e só desliga com APROVACAO_AUTOMATICA=false", () => {
    assert.equal(autoApprovalEnabled({}), true);
    assert.equal(autoApprovalEnabled({ APROVACAO_AUTOMATICA: "true" }), true);
    assert.equal(autoApprovalEnabled({ APROVACAO_AUTOMATICA: "false" }), false);
    assert.equal(autoApprovalEnabled({ APROVACAO_AUTOMATICA: " FALSE " }), false);
  });
});

describe("motivos de recusa automática", () => {
  it("segue quando CPF, nome ou reserva conferem", () => {
    assert.deepEqual(getIdentityRejectionReasons(approvable().identity, approvable().reservation), []);
  });
  it("aponta dados ausentes quando nada confere", () => {
    const identity = { voucher: { name: null, cpf: null }, contract: { name: "FULANO", cpf: null }, cpfMatch: null, nameMatch: null };
    assert.ok(getIdentityRejectionReasons(identity).includes("Nome do cliente ausente ou ilegível no voucher."));
  });
  it("recusa contrato anexado diferente do validado no Coral", () => {
    assert.deepEqual(getContractNumberRejectionReasons({ expected: "REC001097-26", found: "REC001097-26", match: true }), []);
    assert.equal(getContractNumberRejectionReasons({ expected: "REC001097-26", found: "REC009999-26", match: false }).length, 1);
    assert.equal(getContractNumberRejectionReasons(undefined).length, 1);
  });
});
