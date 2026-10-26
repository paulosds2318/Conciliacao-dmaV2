# Conciliação DMA V2

Aplicação web para acompanhar solicitações de consideração ou desconsideração de DMA em contratos, revisar documentos e executar ações manuais por planilha. A interface segue a identidade visual do Módulo de Pedágio. A aplicação foi construída com Next.js 16, React 19, TypeScript, Prisma, PostgreSQL e Better Auth.

## Funcionalidades

### Solicitações de DMA

- O atendente abre uma solicitação para **Considerar DMA** ou **Desconsiderar DMA**, informa o contrato, adiciona observações opcionais e anexa obrigatoriamente o voucher e o contrato em PDF.
- O número do contrato pode ser consultado no Coral antes do envio.
- Os PDFs são validados no servidor e guardados fora da pasta pública.
- A análise via OpenRouter procura nome e CPF no contrato e compara esses dados com o voucher. Se os dados necessários não forem encontrados ou divergirem, a solicitação é recusada automaticamente e fica disponível para correção.
- A análise da IA é auxiliar. Solicitações que passam pela análise seguem para decisão do administrador.
- O administrador aprova ou recusa com justificativa. A aprovação inicia a ação configurada no Coral; a recusa permite ao atendente corrigir os documentos e reenviar a mesma solicitação para aprovação.
- O atendente pode editar ou excluir solicitações pendentes de aprovação, inclusive as reabertas. Solicitações aprovadas não podem ser editadas ou excluídas pelo atendente.
- O administrador pode excluir solicitações de qualquer status e informa o motivo. A exclusão é um arquivamento lógico, preservando o histórico de auditoria.

### Perfis

A aplicação tem dois perfis:

- **Atendente:** cria solicitações, acompanha as que abriu, corrige solicitações recusadas, gerencia as pendentes permitidas e consulta a situação DMA.
- **Admin:** aprova ou recusa solicitações, consulta solicitações aprovadas e arquivadas, acompanha o histórico geral, exclui solicitações informando o motivo, gerencia usuários e executa ações manuais por planilha.

Não há cadastro público. O acesso é criado pelo seed inicial ou pela gestão de usuários do administrador.

### Ações por planilha e consultas

- Importação de planilha para executar ações DMA em vários contratos, com seleção da aba e da coluna de contratos.
- Acompanhamento do resultado por contrato, incluindo falhas e execuções incertas, com opção de continuar ou retomar o processamento.
- Exportação de resultados em Excel e CSV.
- Consulta da situação DMA de um contrato individual ou por planilha, com opção de exportar o resultado.
- Filtros, paginação e botão de atualização nas listas de solicitações.
- Histórico de auditoria com os eventos da solicitação, incluindo reabertura, decisões, alterações e exclusão, com responsável, data e motivo quando aplicável.
- Tema claro e escuro.

## Telas principais

| Caminho | Acesso e finalidade |
| --- | --- |
| `/login` | Autenticação |
| `/` | Página inicial |
| `/solicitacoes/nova` | Abertura de solicitação pelo atendente |
| `/minhas-solicitacoes` | Solicitações abertas pelo atendente |
| `/analise` | Fila de aprovação, solicitações aprovadas e arquivadas/excluídas; auditoria do administrador |
| `/solicitacoes/[id]` | Detalhes, documentos, análise, histórico e ações permitidas pelo perfil |
| `/acoes-manuais` | Importação e histórico de ações por planilha |
| `/acoes-manuais/[id]` | Resultado por contrato e exportação da ação |
| `/consulta-dma` | Consulta individual ou em planilha da situação DMA |
| `/gestao-usuarios` | Gestão de usuários pelo administrador |

## Requisitos

- Node.js 22 ou superior
- PostgreSQL 16 ou superior
- Chave e modelo do OpenRouter para análise automática de documentos
- Credenciais e endpoints do Coral para consultas e ações reais

## Configuração local

1. Crie um arquivo `.env` na raiz do projeto.
2. Preencha as variáveis necessárias, usando valores locais para desenvolvimento:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/conciliacao_dma?schema=public"
BETTER_AUTH_SECRET="gere-um-segredo-aleatorio-com-pelo-menos-32-caracteres"
BETTER_AUTH_URL="http://localhost:3000"

# OpenRouter (necessário para análise documental)
OPENROUTER_API_KEY=""
OPENROUTER_MODEL=""

# Coral: use CORAL_AUTH_TOKEN ou CORAL_USERNAME e CORAL_PASSWORD
CORAL_AUTH_TOKEN=""
CORAL_USERNAME=""
CORAL_PASSWORD=""
CORAL_CONTRACT_LOOKUP_URL="https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}"
CORAL_API_URL=""

# Usuário inicial; o seed só cria perfis com e-mail e senha preenchidos
SEED_ADMIN_EMAIL="admin@exemplo.com"
SEED_ADMIN_PASSWORD=""

# Opcional
MODO_TESTE_API="true"
DOCUMENT_STORAGE_PATH="./private-uploads"
MAX_PDF_SIZE_MB="20"
NEXT_PUBLIC_MAX_PDF_SIZE_MB="20"
```

3. Instale dependências, gere o Prisma Client, crie/atualize o banco e prepare o usuário inicial:

```powershell
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

O seed aceita os pares `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` e `SEED_ATTENDANT_EMAIL`/`SEED_ATTENDANT_PASSWORD`. Para cada perfil, informe e-mail e senha. O seed atualiza o nome, o perfil e a senha de uma conta existente com o mesmo e-mail.

## Executar com Docker Compose

O Compose sobe PostgreSQL e aplicação. O banco fica disponível na porta `5433` do computador e a aplicação em [http://localhost:3001](http://localhost:3001). O container da aplicação conecta ao banco pelo serviço `db` na porta interna `5432`.

Crie o `.env` com as credenciais do OpenRouter, do Coral e do administrador inicial, então execute:

```powershell
docker compose up -d --build
```

Os PDFs ficam no diretório `private-uploads` montado como volume da aplicação. O banco usa o volume nomeado `dma_postgres_data`.

## Variáveis de integração

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão Prisma/PostgreSQL |
| `BETTER_AUTH_SECRET` | Segredo para sessões e autenticação |
| `BETTER_AUTH_URL` | URL pública da aplicação |
| `OPENROUTER_API_KEY` | Chave privada do OpenRouter |
| `OPENROUTER_MODEL` | Modelo configurado para receber e analisar PDFs |
| `CORAL_AUTH_TOKEN` | Token Coral; se não tiver prefixo, o sistema adiciona `Bearer` |
| `CORAL_USERNAME`, `CORAL_PASSWORD` | Alternativa de autenticação Coral via HTTP Basic |
| `CORAL_CONTRACT_LOOKUP_URL` | URL de consulta; deve conter o marcador `{CONTRATO}` |
| `CORAL_API_URL` | Endpoint usado para executar a ação DMA |
| `MODO_TESTE_API` | `true` simula a execução DMA. A consulta do contrato também é simulada quando não há token Coral configurado |
| `DOCUMENT_STORAGE_PATH` | Diretório privado para PDFs |
| `MAX_PDF_SIZE_MB` | Limite de upload por PDF no servidor |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Credenciais para criar/atualizar o administrador inicial |
| `SEED_ATTENDANT_EMAIL`, `SEED_ATTENDANT_PASSWORD` | Credenciais opcionais para criar/atualizar um atendente |
| `FRAME_ANCESTORS` | Origens permitidas na diretiva de segurança `frame-ancestors` |

Nunca publique o arquivo `.env` nem inclua credenciais reais no repositório.

## Integrações e limitações

- O fluxo depende dos endpoints e formatos de autenticação/resposta fornecidos pelo Coral. Confirme o contrato da API e o payload de alteração DMA com a equipe responsável antes de desativar o modo de teste.
- Respostas HTTP de erro na consulta Coral são apresentadas ao usuário como contrato não encontrado. Se a API estiver indisponível ou a autenticação falhar, confirme a causa nos logs do serviço antes de concluir que o contrato não existe.
- A chave e o modelo do OpenRouter precisam estar configurados para a análise automática. Sem eles, a solicitação não completa a comparação documental.
- A ação DMA por planilha registra resultados e não repete automaticamente execuções cujo resultado seja incerto.
- Em produção, use armazenamento persistente e banco gerenciado com política de backup e retenção. O volume local do Compose não substitui uma estratégia de backup.
- O arquivo `render.yaml` descreve uma implantação de demonstração no Render. Configure os segredos no painel do Render e valide a persistência do banco e dos documentos conforme o plano utilizado.

## Comandos úteis

```powershell
npm run dev
npm run build
npm run lint
npm run db:generate
npm run db:push
npm run db:seed
docker compose up -d --build
docker compose down
```
