// PDFs FICTÍCIOS (sem dados reais) para os testes: contrato no modelo padrão, voucher e um documento fora do modelo.
import { writeFileSync } from "node:fs";

function pdf(lines) {
  const text = lines.map((line, index) => `BT /F1 11 Tf 40 ${780 - index * 18} Td (${line}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

const CONTRACT = [
  "Contrato: FOR710001-26 Status: Aberto Reserva: R0000001-26 Origem: Rentcars",
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

export function writePdfs(dir) {
  writeFileSync(`${dir}/contrato-padrao.pdf`, pdf(CONTRACT));
  writeFileSync(`${dir}/voucher.pdf`, pdf(VOUCHER));
  writeFileSync(`${dir}/contrato-fora-do-modelo.pdf`, pdf([...VOUCHER, "Documento qualquer sem as secoes do contrato"]));
}
