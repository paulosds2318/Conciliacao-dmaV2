/**
 * O contrato de locação da Foco segue um modelo único. O contrato anexado precisa ser um PDF com texto que traga o cabeçalho
 * com o número ("Contrato: AAA000000-00"), as seções de dados e os textos jurídicos do contrato; qualquer outro documento
 * (voucher, print, foto, PDF digitalizado, outro modelo, só a primeira página) é recusado.
 * Os padrões comparam o texto sem acentos, sem espaços e em minúsculas, porque a extração do PDF quebra linhas no meio dos títulos.
 */
type Section = { label: string; pattern: RegExp };

/** Cabeçalho e seções de dados do contrato. */
const CORE_SECTIONS: Section[] = [
  { label: "Número do contrato (Contrato: AAA000000-00)", pattern: /contrato:?[a-z]{3}\d{3,}-\d{2}/ },
  { label: "Dados da retirada", pattern: /dadosdaretirada/ },
  { label: "Dados da devolução", pattern: /dadosdadevolucao/ },
  { label: "Locatário / Contratante", pattern: /locatario\/?contratante/ },
  { label: "Dados do veículo", pattern: /dadosdoveiculo/ },
  { label: "Preços de locação", pattern: /precosdelocacao/ },
];
/** Textos jurídicos fixos do contrato. Só o contrato os tem; garantem que o PDF é o documento inteiro e não só a primeira página. */
const LEGAL_SECTIONS: Section[] = [
  { label: "Informações importantes sobre o contrato de locação", pattern: /informacoesimportantessobreocontratodelocacao/ },
  { label: "Termos e Condições gerais do contrato de locação", pattern: /termosecondicoesgeraisdocontratodelocacao/ },
];
const REQUIRED_SECTIONS = [...CORE_SECTIONS, ...LEGAL_SECTIONS];

const compact = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s/g, "");

/** Seções do modelo padrão que não aparecem no texto do contrato anexado. */
export function missingContractSections(text: string) {
  const plain = compact(text);
  return REQUIRED_SECTIONS.filter((section) => !section.pattern.test(plain)).map((section) => section.label);
}

/**
 * O texto é de um contrato de locação da Foco: tem os textos jurídicos do contrato e a maior parte das seções de dados.
 * Serve para barrar um contrato anexado no campo do voucher. Pede os textos jurídicos para não confundir com uma confirmação
 * de reserva, que traz cabeçalho e dados parecidos mas não é o contrato.
 */
export function looksLikeFocoContract(text: string) {
  const plain = compact(text);
  const legal = LEGAL_SECTIONS.some((section) => section.pattern.test(plain));
  const core = CORE_SECTIONS.filter((section) => section.pattern.test(plain)).length;
  return legal && core >= 4;
}

export const NO_TEXT_CONTRACT_REASON =
  "O PDF do contrato não tem texto que possa ser conferido (parece digitalizado ou fotografado). Anexe o PDF original do contrato de locação padrão da Foco, sem digitalizar nem fotografar.";
export const VOUCHER_IS_CONTRACT_MESSAGE =
  "O arquivo anexado como voucher é um contrato de locação da Foco, e não um voucher. Anexe o voucher da reserva no campo Voucher e o contrato no campo Contrato.";

/**
 * Motivo da recusa quando o contrato anexado não é o modelo padrão (lista vazia quando é). `text` é o texto do PDF, ou null
 * quando não há texto: imagem ou PDF digitalizado, que não dá para conferir e por isso não vale.
 */
export function contractLayoutReasons(text: string | null) {
  if (text === null) return [NO_TEXT_CONTRACT_REASON];
  const missing = missingContractSections(text);
  if (!missing.length) return [];
  return [
    `O contrato anexado não está no modelo padrão da Foco. Não foram encontradas as seções: ${missing.join(", ")}. Anexe o contrato de locação padrão da Foco, sem alterações.`,
  ];
}

export const SAME_DOCUMENT_MESSAGE =
  "O voucher e o contrato têm o mesmo conteúdo: um é cópia ou parte do outro. Anexe o voucher da reserva no campo Voucher e o contrato de locação no campo Contrato.";

/**
 * O texto de um dos PDFs é igual ao do outro ou está contido nele (ex.: só a primeira página do contrato, ou outra exportação
 * do mesmo contrato, no campo do voucher). Um voucher de parceiro nunca está contido num contrato. Compara sem acentos nem
 * espaços; textos curtos demais não entram, para não casar por acaso.
 */
export function sameDocumentText(voucherText: string, contractText: string) {
  const a = compact(voucherText);
  const b = compact(contractText);
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 200 && longer.includes(shorter);
}

/** Motivo da recusa quando o texto do voucher é cópia ou parte do contrato (ou o contrário). */
export function voucherDuplicatesContractReasons(input: { voucherText: string | null; contractText: string | null }) {
  const { voucherText, contractText } = input;
  return voucherText !== null && contractText !== null && sameDocumentText(voucherText, contractText) ? [SAME_DOCUMENT_MESSAGE] : [];
}

/** Motivo da recusa quando o arquivo do voucher é um contrato da Foco (lista vazia quando não é). */
export function voucherIsContractReasons(input: { text: string | null; ai?: boolean | null }) {
  const isContract = input.text !== null ? looksLikeFocoContract(input.text) : input.ai === true;
  return isContract ? [VOUCHER_IS_CONTRACT_MESSAGE] : [];
}
