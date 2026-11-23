// Fluxos de tela: conferência de anexos, aprovação com redirecionamento e aviso, erro de aprovação e aprovação forçada.
import { login } from "./lib/cdp.mjs";

export async function runFlows({ page, base, docs, password, report }) {
  const { check } = report;
  const path = (name) => `${docs}/${name}`;
  const fieldError = (n) =>
    page.evaluate(`document.querySelectorAll(".attachment-field")[${n}]?.querySelector(".error-notice")?.innerText ?? ""`);
  const fieldFile = (n) =>
    page.evaluate(`document.querySelectorAll(".attachment-field")[${n}]?.querySelector(".attachment-selected span")?.innerText ?? ""`);
  const waitError = (n) => page.waitFor(`document.querySelectorAll(".attachment-field")[${n}]?.querySelector(".error-notice")`, 15000);
  const waitFile = (n) =>
    page.waitFor(`document.querySelectorAll(".attachment-field")[${n}]?.querySelector(".attachment-selected")`, 15000);

  // ===== A. Conferência dos anexos ao escolher o arquivo (atendente) =====
  check("login do atendente", (await login(page, base, "teste.atendente@local.test", password)) === 200);
  await page.navigate(`${base}/solicitacoes/nova`);
  const notice = await page.text("main");
  check(
    "aviso do formulário: sem a frase da aprovação automática",
    !notice.includes("Rentalcars") && !notice.includes("aprovados automaticamente"),
  );
  check("aviso do formulário: legível e nome do cliente", notice.includes("O voucher precisa estar legível e mostrar o nome do cliente."));
  await page.setValue('select[name="actionType"]', "DESCONSIDERAR_DMA");
  await page.sleep(500);

  await page.setFile('input[name="contract"]', path("contrato-fora-do-modelo.pdf"));
  await waitError(1);
  const outOfModel = await fieldError(1);
  check("contrato fora do modelo: mensagem abaixo do campo", outOfModel.includes("não está no modelo padrão da Foco"), outOfModel);
  check("contrato fora do modelo: arquivo descartado", (await fieldFile(1)) === "");

  await page.setFile('input[name="contract"]', path("contrato-padrao.pdf"));
  await waitFile(1);
  check("contrato no modelo padrão: aceito, sem erro", (await fieldFile(1)) === "contrato-padrao.pdf" && (await fieldError(1)) === "");

  await page.setFile('input[name="voucher"]', path("contrato-padrao.pdf"));
  await waitError(0);
  const contractAsVoucher = await fieldError(0);
  check(
    "contrato no campo do voucher: recusado com mensagem",
    /mesmo arquivo|é um contrato de locação/.test(contractAsVoucher),
    contractAsVoucher,
  );
  check("contrato no campo do voucher: arquivo descartado", (await fieldFile(0)) === "");

  await page.setFile('input[name="voucher"]', path("voucher.pdf"));
  await waitFile(0);
  check("voucher de verdade: aceito", (await fieldFile(0)) === "voucher.pdf" && (await fieldError(0)) === "");

  await page.click("Remover anexo");
  await page.sleep(500);
  await page.click("Remover anexo", 'document.querySelector("[role=dialog]")');
  await page.sleep(800);
  check("remover anexo: sem a linha “Removido após confirmação”", !(await page.text("main")).includes("Removido após confirmação"));

  // ===== B. Aprovação individual: redirecionamento e aviso (admin) =====
  check("login do administrador", (await login(page, base, "teste.admin@local.test", password)) === 200);
  await page.navigate(`${base}/solicitacoes/q1`);
  await page.click("Validar e executar ação");
  await page.sleep(700);
  const dialog = await page.text('[role="dialog"]');
  check("diálogo de aprovar: texto novo", dialog.includes("Ao concluir, você volta para a tela de aprovações."), dialog);
  await page.click("Aprovar e executar", 'document.querySelector("[role=dialog]")');
  check("aprovação concluída: volta para a tela de aprovações", await page.waitFor(`location.pathname === "/analise"`, 30000));
  await page.sleep(1500);
  const flash = await page.text("main");
  check(
    "fila mostra o aviso com contrato e ação",
    flash.includes("Solicitação FOR710001-26 (Desconsiderar DMA) aprovada e concluída no Coral."),
    flash.slice(0, 160),
  );

  // ===== C. Aprovação com erro: fica na tela e mostra o motivo =====
  await page.navigate(`${base}/solicitacoes/q2`);
  await page.click("Validar e executar ação");
  await page.sleep(700);
  await page.click("Aprovar e executar", 'document.querySelector("[role=dialog]")');
  await page.sleep(2500);
  check("aprovação com erro: continua na tela da solicitação", (await page.evaluate("location.pathname")) === "/solicitacoes/q2");
  check("aprovação com erro: mostra o motivo", (await page.text("main")).includes("identificador interno"));

  // ===== D. Aprovação forçada: redirecionamento e aviso =====
  await page.navigate(`${base}/solicitacoes/q3`);
  await page.click("Aprovar mesmo assim");
  await page.sleep(700);
  await page.setValue("[role=dialog] textarea", "Conferido com a cliente por telefone; dados corretos.");
  const forceDialog = await page.text('[role="dialog"]');
  check(
    "diálogo da aprovação forçada: texto novo",
    forceDialog.includes("mesmo com a recusa. Ao concluir, você volta para a tela de aprovações."),
    forceDialog,
  );
  await page.click("Aprovar mesmo assim", 'document.querySelector("[role=dialog]")');
  check("aprovação forçada concluída: volta para a tela de aprovações", await page.waitFor(`location.pathname === "/analise"`, 30000));
  await page.sleep(1500);
  const flash2 = await page.text("main");
  check(
    "fila mostra o aviso da aprovação forçada",
    flash2.includes("Solicitação FOR710003-26 (Desconsiderar DMA) aprovada por aprovação forçada e concluída no Coral."),
    flash2.slice(0, 170),
  );
}
