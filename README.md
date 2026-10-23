# Conciliação DMA V2

Aplicação web para solicitar ações DMA em contratos, anexar comprovantes, comparar documentos com OpenRouter e encaminhar a decisão para analistas. A stack segue o Módulo de Pedágio: Next.js App Router, React, TypeScript, Prisma/PostgreSQL e Better Auth.

## Fluxo implementado

1. O atendente autentica e seleciona Considerar DMA ou Desconsiderar DMA.
2. Informa o número do contrato; a aplicação consulta `GET /api/rentagreement/{CONTRATO}` no Coral.
3. Voucher e contrato são obrigatórios, validados como PDF no servidor e gravados fora da pasta pública.
4. O backend envia os dois PDFs ao modelo configurado no OpenRouter para análise comparativa. A análise é auxiliar, nunca aprova automaticamente.
5. O analista visualiza os PDFs e o resultado, aprova ou recusa com justificativa.
6. A aprovação executa uma única chamada à API DMA configurada. A recusa retorna ao atendente, que pode enviar nova versão dos dois arquivos.

## Configuração local

Requer Node.js 22+, PostgreSQL e credenciais de integração. Copie `.env.example` para `.env` e configure o banco, segredo Better Auth, usuário e senha Coral e credenciais OpenRouter.

```powershell
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

O seed cria somente os perfis para os quais foram definidos pares de e-mail e senha no ambiente: `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, `SEED_ANALYST_EMAIL`/`SEED_ANALYST_PASSWORD` e `SEED_ATTENDANT_EMAIL`/`SEED_ATTENDANT_PASSWORD`. Não existe cadastro público.

`MODO_TESTE_API=true` (padrão) simula consulta e execução DMA Coral. Para produção, use `false` e configure `CORAL_API_URL`, `CORAL_USERNAME` e `CORAL_PASSWORD`. O código envia usuário e senha via HTTP Basic Auth; confirme com o Coral se esse é o formato aceito, pois a V1 documenta Bearer token. O endpoint e o formato do POST DMA ainda precisam ser confirmados pelo time Coral antes de habilitar produção. Configure `OPENROUTER_API_KEY` e um `OPENROUTER_MODEL` habilitado para entrada de PDF para processar solicitações.

Arquivos ficam em `DOCUMENT_STORAGE_PATH` (por padrão `./private-uploads`) e não são servidos publicamente. Configure volume persistente e política de retenção ao implantar.

## Rotas da aplicação

- `/login`: autenticação
- `/`: instruções e atalhos
- `/solicitacoes/nova`: contrato, ação e anexos
- `/minhas-solicitacoes`: histórico do atendente
- `/analise`: fila de analistas
- `/solicitacoes/{id}`: documentos, análise, decisão e histórico

## Limites de integração

A busca individual usa o endpoint informado para a V2. A V1 documenta token Bearer, enquanto a V2 está configurada para HTTP Basic Auth com `CORAL_USERNAME` e `CORAL_PASSWORD`; confirme com o Coral se esse formato é aceito antes de desativar o modo de teste. O formato completo da resposta de busca não foi fornecido e é normalizado por aliases comuns; revise `src/lib/server/coral.ts` quando o contrato JSON oficial estiver disponível. A URL/payload de alteração DMA de produção também não foi confirmado; a URL de exemplo permanece demonstrativa. Não há retentativa automática se o resultado da execução ficar incerto.
