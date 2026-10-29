# Documento de transferência — Conciliação DMA V2

**Atualizado em:** 28/10/2026  
**Repositório:** `paulosds2318/Conciliacao-dmaV2`  
**Objetivo:** dar ao próximo assistente contexto suficiente para continuar o desenvolvimento sem depender do histórico desta conversa.

## 1. Resumo do produto

Aplicação web interna para solicitar, analisar, aprovar e executar ações de **Considerar DMA** ou **Desconsiderar DMA** em contratos. Também oferece ações manuais por planilha, consulta da situação DMA, auditoria e gestão de usuários.

O fluxo de aprovação é humano: a IA compara os documentos e fornece uma análise auxiliar; quem aprova ou recusa é o administrador. A aprovação pode disparar a atualização no Coral.

## 2. Tecnologias e organização

- Next.js 16.4 com App Router, React 19 e TypeScript.
- PostgreSQL e Prisma 6.19.1.
- Better Auth para autenticação, sessões e perfis.
- OpenRouter para leitura/comparação dos PDFs.
- Integração Coral para consultar contratos e aplicar ações DMA.
- ExcelJS para leitura e relatórios de planilhas.
- Docker Compose para desenvolvimento local; `render.yaml` descreve uma demonstração no Render.

Pastas importantes:

- `src/app/`: páginas e manipuladores de API.
- `src/components/`: telas e componentes interativos.
- `src/lib/server/`: autenticação, Coral, OpenRouter, armazenamento, planilhas e análise.
- `src/lib/services/`: regras compartilhadas, incluindo estados das solicitações.
- `prisma/schema.prisma`: modelos e relações do banco.
- `prisma/seed.ts`: criação/atualização das contas iniciais.
- `Dockerfile`, `docker-compose.yml`, `render.yaml`: execução e implantação.

## 3. Perfis e permissões

### Atendente

- Abre solicitações e acompanha as próprias solicitações, inclusive as arquivadas.
- Envia voucher e contrato, ambos obrigatórios em PDF.
- Corrige e reabre solicitações recusadas pela análise/administração.
- Pode editar ou excluir solicitações próprias pendentes de aprovação, inclusive reabertas. Solicitações aprovadas não podem ser editadas/excluídas pelo atendente.
- Pode consultar a situação DMA individualmente ou por planilha.
- Pode repetir a análise documental de uma solicitação em `ANALYSIS_FAILED`, usando os PDFs já enviados.

### Administrador

- Analisa a fila, aprova ou recusa com justificativa.
- Consulta solicitações aprovadas, concluídas, arquivadas/excluídas e o acompanhamento geral.
- Pode excluir/arquivar solicitações em qualquer estado; deve informar o motivo. O arquivamento é lógico e preserva histórico.
- Gerencia usuários e executa ações manuais por planilha.
- Não abre solicitações nem possui a lista “Minhas solicitações”.

## 4. Fluxos principais

### Solicitação de ação DMA

1. Atendente escolhe a ação e informa o contrato.
2. A aplicação pode consultar o número no Coral, conforme a configuração.
3. Voucher e contrato em PDF são obrigatórios; os arquivos são validados no servidor e armazenados fora da pasta pública.
4. OpenRouter lê nome e CPF do cliente nos documentos e produz comparação e evidências.
5. A análise concluída sem dados de identidade ausentes deixa a solicitação em `PENDING_REVIEW`; ela entra na fila do administrador.
6. O administrador aprova ou recusa. A aprovação inicia a chamada de ação ao Coral; a recusa registra justificativa e permite correção/reenvio.
7. Reabertura cria nova versão, preserva versões anteriores e registra motivo e responsável no histórico.

### Estados persistidos de solicitação

Os valores internos são identificadores técnicos em inglês; a interface usa rótulos em português.

| Estado interno | Rótulo/uso |
| --- | --- |
| `ANALYZING` | Em análise documental |
| `PENDING_REVIEW` | Aguardando aprovação do administrador |
| `REJECTED` | Recusada; correção disponível |
| `ANALYSIS_FAILED` | Análise não concluída; nova tentativa disponível |
| `EXECUTING` | Aprovada; execução no Coral em andamento |
| `COMPLETED` | Ação concluída no Coral |
| `EXECUTION_FAILED` | Falha ao executar ação no Coral |
| `EXECUTION_UNCERTAIN` | Resultado da ação não confirmado |
| `CANCELLED` | Cancelada |
| `ARCHIVED` | Arquivada/excluída |

`PENDING_REVIEW` continua sendo o estado salvo após uma reabertura aprovada pela análise. A lista administrativa indica a reabertura e o motivo junto ao estado de aprovação.

### Ação manual por planilha

Importa planilha, permite escolher aba/coluna, acompanha resultado por contrato e registra tentativas. Há estados para concluído, falha, resultado incerto, ignorado, em andamento e pausado. Falha definitiva pode ser reenviada; resultado incerto requer confirmação explícita para evitar duplicidade. Exporta Excel/CSV. Ações podem ser arquivadas com motivo e permanecem auditáveis.

### Auditoria

Eventos são registrados em `AuditEvent` com tipo, data, ator e detalhes. Solicitações e planilhas arquivadas mantêm registros para consulta. Evite apagar registros definitivamente ou remover eventos ao alterar fluxos.

## 5. Integrações

### OpenRouter

- Variáveis: `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`.
- Implementação: `src/lib/server/openrouter.ts` e `src/lib/server/analyze-request.ts`.
- PDFs são enviados ao serviço OpenRouter para análise; não registrar nem exibir a chave em logs/documentos.
- A chave salva no `.env` foi verificada e respondeu HTTP 200. O contêiner local inicialmente tinha uma chave antiga e recebeu HTTP 401; após recriação, a chave dentro do contêiner respondeu HTTP 200.
- Uma solicitação local recente ficou em `ANALYSIS_FAILED` porque a chamada anterior recebeu 401. O estado não muda sozinho quando a chave é corrigida. O atendente responsável precisa abrir essa solicitação e usar **Tentar análise novamente**; a rota reutiliza os PDFs da versão atual. Se a comparação passar, ela vai para a fila administrativa.

### Coral

- Consulta de contrato: `CORAL_CONTRACT_LOOKUP_URL`, atualmente documentada como `https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}`.
- Ação DMA: `PUT /api/rentagreement/dma/eligibility` (ou URL configurada), enviando `action` como `REGARD`/`DISREGARD` e `rentAgreementIds` com o identificador interno do contrato.
- Autenticação da ação usa `CORAL_AUTH_TOKEN` como Bearer. O guia fornecido para o endpoint indica permissão `BULK_UPDATE_DMA_ELIGIBILITY` e validade de token de uma hora. A integração de produção precisa de estratégia para renovar/fornecer tokens; não presumir que um token copiado do navegador permaneça válido.
- `CORAL_USERNAME` e `CORAL_PASSWORD` são uma alternativa para autenticação da consulta, não substituem automaticamente o token usado na ação DMA.
- `MODO_TESTE_API=true` simula a execução DMA. O `render.yaml` da demonstração define esse modo como ligado.
- Erro HTTP 5xx pode significar resultado incerto; não repetir automaticamente ação que talvez já tenha sido aplicada.

### Revisão funcional importante da análise documental

`comparePdfs` devolve `identity.cpfMatch` e `identity.nameMatch`, e a tela mostra os resultados por campo. Porém, `getIdentityRejectionReasons()` em `src/lib/server/identity-check.ts` atualmente rejeita automaticamente quando nome/CPF não foi localizado em cada documento; `analyzeRequest()` não acrescenta motivo de recusa só porque CPF ou nome divergiram (`cpfMatch === false`/`nameMatch === false`). Confirmar a regra desejada e corrigir antes de considerar concluída a validação automática de divergências.

## 6. Páginas e rotas de API

Páginas:

- `/login`: acesso.
- `/`: painel inicial conforme o perfil.
- `/solicitacoes/nova`, `/minhas-solicitacoes`: abertura e acompanhamento do atendente.
- `/solicitacoes/[id]`: documentos, análise, decisões, correção e histórico.
- `/analise`: fila de aprovação; abas para pendentes, aprovadas, arquivadas/excluídas e acompanhamento geral.
- `/acoes-manuais`, `/acoes-manuais/[id]`: importar e acompanhar execução por planilha.
- `/consulta-dma`: consulta de situação DMA.
- `/gestao-usuarios`: gestão administrativa de contas.

APIs relevantes:

- `/api/auth/[...all]`: Better Auth.
- `/api/requests`: listar/criar solicitações.
- `/api/requests/[id]`: consultar uma solicitação.
- `/api/requests/[id]/correction`: reabrir com novos PDFs e motivo.
- `/api/requests/[id]/reanalyze`: repetir a análise de uma versão já enviada, sem reenviar arquivos.
- `/api/requests/[id]/decision`: decisão do administrador.
- `/api/requests/[id]/archive`, `/cancel`, `/edit`, `/documents/[documentId]`: arquivamento, cancelamento, edição e leitura autorizada de documentos.
- `/api/requests/report`: relatório de solicitações.
- `/api/batches`, `/api/batches/[id]`, `/execute`, `/retry`, `/report`, `/preview`: ações por planilha.
- `/api/contracts` e `/api/contracts/status*`: consulta/validação de contratos e situação DMA.
- `/api/admin/users` e `/api/admin/users/[id]`: gestão de usuários.

## 7. Variáveis de configuração

Não foi encontrado `.env.example` na raiz durante a preparação deste documento. O README contém uma lista de referência. O `.env` real contém segredos: **não copie seus valores para este documento, para o Claude ou para o repositório**. Consulte-o apenas localmente.

- Banco/autenticação: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- IA: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- Coral: `CORAL_AUTH_TOKEN`, `CORAL_USERNAME`, `CORAL_PASSWORD`, `CORAL_CONTRACT_LOOKUP_URL`, `CORAL_DMA_ELIGIBILITY_URL`, `CORAL_API_URL` (alias legado).
- Armazenamento: `DOCUMENT_STORAGE_PATH`, `MAX_PDF_SIZE_MB`, `NEXT_PUBLIC_MAX_PDF_SIZE_MB`.
- Inicialização: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ATTENDANT_EMAIL`, `SEED_ATTENDANT_PASSWORD`.
- Outros: `MODO_TESTE_API`, `FRAME_ANCESTORS`, `RENDER_EXTERNAL_URL`, `PORT`, `HOSTNAME`, `NODE_ENV`.

## 8. Desenvolvimento e implantação local

Com Docker Compose:

- Aplicação: `http://localhost:3001`.
- PostgreSQL: porta `5433` no computador; dentro da rede Docker, serviço `db:5432`.
- Uploads privados: volume local `./private-uploads`.
- Banco: volume nomeado `dma_postgres_data`.

Comandos usuais no PowerShell:

```powershell
docker compose up -d --build
docker compose up -d --build --force-recreate app
docker compose ps
docker compose logs -f app
docker compose down
```

Para desenvolvimento sem Docker: Node.js 22+, PostgreSQL 16+, `npm install`, `npx prisma generate`, `npx prisma db push`, `npm run db:seed`, `npm run dev`.

Scripts existentes: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run db:generate`, `npm run db:seed`, `npm run db:push`, `npm run db:migrate:deploy`. Não há script de teste configurado no `package.json`.

O último build Docker, após adicionar a repetição de análise, passou em 28/10/2026. O localhost `/login` respondeu HTTP 200. A consulta autenticada ao OpenRouter feita de dentro do contêiner também respondeu HTTP 200.

## 9. Demonstração Render e produção

`render.yaml` define serviço e banco gratuitos para demonstração, branch `main`, health check `/login`, seed inicial e `MODO_TESTE_API=true`. As variáveis OpenRouter e credenciais do administrador são inseridas manualmente no painel. A demonstração gratuita pode ter limites de persistência, disponibilidade e retenção; não tratá-la como ambiente de produção.

Para produção, confirmar banco gerenciado com backup, armazenamento persistente para PDFs, URL pública correta, segredo de autenticação forte, token Coral renovável e modo de teste desligado somente após validação/homologação autorizada.

## 10. Instruções ao próximo assistente

1. Leia `AGENTS.md` e a documentação Next instalada em `node_modules/next/dist/docs/` antes de alterar código Next.js; esta versão é Next.js 16.4.
2. Preserve a interface e as mensagens para usuários em português. Nomes de serviços, campos de APIs, variáveis de ambiente e identificadores internos podem permanecer em inglês quando forem contratos técnicos.
3. Nunca leia em voz alta, imprima, registre, inclua em respostas ou commite valores do `.env`; nunca exponha PDFs, CPF ou dados de clientes em logs.
4. Preserve autorização por perfil, trilha de auditoria, versionamento de documentos e confirmações de ações importantes.
5. Ao alterar status, atualize apresentação, filtros, relatórios, auditoria e transições sem traduzir os valores persistidos/esperados por APIs.
6. Antes de qualquer ação real no Coral, confirme modo de teste, ambiente (homologação/produção), token e risco de duplicidade. Ações incertas não devem ser repetidas automaticamente.
7. A solicitação de análise falha atualmente registrada precisa ser repetida pelo atendente responsável na interface. Não mudar seu estado diretamente no banco para fazê-la aparecer na fila.
