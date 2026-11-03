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
