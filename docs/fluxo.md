# Fluxo de solicitações DMA

- `ANALYZING`: os documentos foram gravados e a comparação automática está em execução.
- `PENDING_REVIEW`: a análise concluiu; aguarda um administrador.
- `REJECTED`: foi recusada com justificativa e pode receber uma nova versão dos dois documentos.
- `ANALYSIS_FAILED`: OpenRouter falhou; a solicitação fica visível para diagnóstico, sem decisão automática.
- `EXECUTING`: a aprovação foi registrada e a chamada Coral está em andamento.
- `COMPLETED`: Coral confirmou HTTP 2xx (ou a simulação local concluiu).
- `EXECUTION_FAILED`: Coral retornou erro definitivo.
- `EXECUTION_UNCERTAIN`: timeout, falha de rede ou HTTP 5xx; nenhuma repetição automática é feita.

A aprovação é humana mesmo se a IA indicar divergência ou alta confiança. Cada correção cria uma nova versão dos documentos e preserva versões anteriores para auditoria.
