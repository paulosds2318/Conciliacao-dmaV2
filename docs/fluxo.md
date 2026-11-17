# Fluxo de solicitações DMA

- `ANALYZING`: os documentos foram gravados e a comparação automática está em execução, em segundo plano (a tela se atualiza sozinha). Se ficar parada por mais de 5 minutos (ex.: servidor reiniciado), vira `ANALYSIS_FAILED` e pode ser repetida.
- `PENDING_REVIEW`: a análise concluiu; aguarda um administrador.
- `REJECTED`: foi recusada com justificativa e pode receber uma nova versão dos dois documentos.
- `ANALYSIS_FAILED`: OpenRouter falhou; a solicitação fica visível para diagnóstico, sem decisão automática.
- `EXECUTING`: a aprovação foi registrada e a chamada Coral está em andamento.
- `COMPLETED`: Coral confirmou HTTP 2xx (ou a simulação local concluiu).
- `EXECUTION_FAILED`: Coral retornou erro definitivo.
- `EXECUTION_UNCERTAIN`: timeout, falha de rede, HTTP 5xx ou envio interrompido por mais de 5 minutos; nenhuma repetição automática é feita. O administrador confere no Coral e registra se a ação foi aplicada (`COMPLETED`) ou não (`EXECUTION_FAILED`), com descrição do que conferiu.

A aprovação é humana mesmo se a IA indicar divergência ou alta confiança, com uma exceção: voucher da Rentalcars ou da Rentcars (a Confirmação de Reserva Foco com `Origem: RentalCars` ou `Origem: Rentcars`, o voucher emitido pela Rentalcars.com, ou o "VOUCHER - DOCUMENTO DA RESERVA" da Rentcars com `Código da Solicitação Rentcars`) segue direto de `PENDING_REVIEW` para `EXECUTING`, sem administrador, quando o número do contrato anexado confere com o Coral, o CPF ou o nome do cliente conferem com o contrato e não há divergência de CPF, nome ou código da reserva. A aprovação automática fica no histórico como evento do Sistema. Cada correção cria uma nova versão dos documentos e preserva versões anteriores para auditoria.

Identificação do parceiro para a aprovação automática: em voucher PDF com texto, o sistema lê o próprio texto (`Origem: X`, `Código da Solicitação Rentcars`, `Voucher da Reserva | Rentcars`); citações soltas, como "faturado por rentcars.com" em apólices da RentalCover, não contam. Só em imagens e PDFs escaneados vale a leitura da IA. `APROVACAO_AUTOMATICA=false` desliga a aprovação automática na hora.

## Aprovação em lote e aprovação forçada

**Em lote.** Na aba Pendentes da fila do administrador, as solicitações podem ser marcadas e aprovadas de uma vez (até 100 por lote). O navegador aprova uma por vez, pela mesma rota da aprovação individual (`POST /api/requests/{id}/decision`), com a justificativa "Aprovação em lote" e a ação executada no Coral para cada uma. O "marcar todas" deixa de fora as solicitações com divergência apontada pela IA (`matches === false`); elas só entram se marcadas uma a uma, e a confirmação avisa. Uma solicitação cuja execução falha no Coral (`EXECUTION_FAILED`) não tem caminho de volta, então o lote é interrompido depois de duas falhas seguidas do Coral e as demais continuam pendentes. A página precisa ficar aberta até o fim; se fechar, as que ainda não foram enviadas continuam pendentes.

**Forçada.** O administrador pode aprovar uma solicitação `REJECTED`, recusada pela análise automática ou por ele mesmo (`POST /api/requests/{id}/force-approve`). A justificativa é obrigatória (mínimo de 10 caracteres). A solicitação passa de `REJECTED` direto para `EXECUTING`, com a ação executada no Coral. O histórico registra o evento `REQUEST_FORCE_APPROVED`, com a justificativa e os motivos da recusa, e a decisão `APPROVE` fica gravada com a justificativa. Atendentes não têm acesso a essa rota. Solicitações em `ANALYSIS_FAILED` não entram: a análise não chegou a recusar nada.

## Motivos da recusa automática

A recusa automática diz o que faltou e o que foi lido no outro documento, por exemplo: `Nome do cliente ausente ou ilegível no voucher. No contrato consta: “MARIA SOUZA”.` Os motivos ficam no evento `AI_AUTO_REJECTED` (`details.reasons`) e aparecem na tela da solicitação e na mensagem ao atendente depois do envio. A tela também mostra a conferência campo a campo, com os valores lidos em cada documento. Quando voucher e contrato trazem os dois dados e eles divergem, a solicitação não é recusada: segue para o administrador, com as divergências destacadas na tela de decisão.

## Anexos: contrato padrão em PDF e voucher que não seja contrato

**Contrato.** Só PDF, e tem que ser o contrato de locação padrão da Foco. A conferência roda no envio (a solicitação nem é criada) e de novo na análise, em `src/lib/server/contract-layout.ts`, lendo o texto do PDF e ignorando acentos, maiúsculas e espaços. O PDF precisa ter a linha `Contrato: AAA000000-00`, as seções "Dados da retirada", "Dados da devolução", "Locatário / Contratante", "Dados do veículo" e "Preços de locação" e os textos jurídicos "Informações importantes sobre o contrato de locação" e "Termos e Condições gerais do contrato de locação" (que garantem que não é só a primeira página). São barrados, com a mensagem do que falta: imagem ou foto, PDF digitalizado (sem texto para conferir) e qualquer PDF fora do modelo. O campo de anexo do contrato só aceita PDF.

**Voucher.** PDF ou imagem. Não pode ser o mesmo arquivo do contrato (conteúdo idêntico, SHA-256, mesmo com outro nome) nem um contrato da Foco:

- PDF com texto: é conferido pelo mesmo modelo (textos jurídicos do contrato e quatro ou mais seções de dados). Uma confirmação de reserva, que não traz os textos jurídicos, não é confundida com o contrato.
- PDF com texto cujo texto é igual ao do contrato ou está contido nele (outra exportação do mesmo contrato, ou só a primeira página dele) também é barrado, mesmo sem os textos jurídicos. Um voucher de parceiro nunca está contido num contrato.
- Imagem ou PDF digitalizado: não há texto para conferir no envio. Na análise, a IA avalia (`voucherIsContract`) e, se disser que é um contrato, a solicitação é recusada.

**Parceiro (aprovação automática).** Vem sempre do voucher: do texto do PDF ou da leitura da IA. O campo "Origem" do contrato nunca conta, e a IA é instruída a ignorá-lo.

As conferências do envio ficam em `src/lib/server/attachment-check.ts`, usadas pela abertura (`POST /api/requests`) e pela correção (`POST /api/requests/{id}/correction`). O navegador avisa na hora o que dá para saber sem ler o PDF (tipo do arquivo e arquivo repetido); o servidor garante a regra.

**Mudança no modelo do contrato.** A conferência exige os títulos acima. Se a Foco renomear ou tirar um deles, contratos bons passam a ser recusados (a mensagem diz qual título faltou). Ajuste as listas `CORE_SECTIONS` e `LEGAL_SECTIONS` em `contract-layout.ts`. Uma seção nova no contrato não quebra nada; só entra na exigência se for incluída nessas listas. O administrador pode usar o "Forçar aprovação" nos casos urgentes de solicitações recusadas pela análise.
