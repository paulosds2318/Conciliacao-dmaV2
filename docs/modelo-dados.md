# Modelo de dados

- `User`, `Session`, `Account`, `Verification`: Better Auth e perfis `attendant`, `admin`.
- `DmaRequest`: ação DMA, contrato, solicitante, versão e estado.
- `RequestDocument`: chave privada, hash, tipo e versão do PDF.
- `AiAnalysis`: modelo, resultado, confiança e status por versão.
- `ReviewDecision`: decisão humana e justificativa por versão.
- `ExecutionAttempt`: tentativa de execução Coral e resultado conhecido/incerto.
- `AuditEvent`: trilha de eventos principais.

Relações e índices estão no `prisma/schema.prisma`; em ambiente local aplique com `npx prisma db push`.
