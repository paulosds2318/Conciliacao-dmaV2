# Testes de tela (navegador real)

Abrem o app local num navegador de verdade e conferem os fluxos que os testes unitários não alcançam: conferência de anexos ao escolher o arquivo, aprovação com redirecionamento e aviso, aprovação com erro, aprovação forçada, e uma auditoria de **celular e acessibilidade** (axe-core) em todas as telas principais.

Tudo usa **dados fictícios** e o **Coral simulado**. Nada é enviado a sistema externo, e nenhum documento real é usado.

## Como rodar

1. Suba o app local em **modo de teste** (o Coral fica simulado):

   ```
   docker compose -f docker-compose.yml -f test/e2e/docker-compose.test.yml up -d --build app
   ```

2. Rode os testes:

   ```
   npm run test:e2e
   ```

O comando cria usuários e solicitações de teste (`@local.test`, `FOR710001-26` a `FOR710003-26`), abre um navegador sem janela, roda as verificações e **remove os dados de teste ao final**. A senha dos usuários de teste é aleatória a cada execução.

Para voltar o app ao modo normal depois: `docker compose up -d --build app`.

## O que é verificado

- **Fluxos** (`fluxos.mjs`): contrato fora do modelo e contrato no campo do voucher são recusados na hora, com a mensagem abaixo do campo e o arquivo descartado; contrato padrão e voucher de verdade são aceitos; aprovar volta para a tela de aprovações com o aviso; aprovação com erro fica na tela com o motivo; aprovação forçada volta para a fila com o aviso.
- **Acessibilidade** (`acessibilidade.mjs`): em celular (375 px) e desktop, para 11 telas mais a fila com seleção, o diálogo de confirmação e a página do lote: sem rolagem horizontal, sem texto menor que 11 px e sem violações do axe-core (WCAG 2.0/2.1 A e AA e boas práticas).

## Variáveis (opcionais)

| Variável                                 | Padrão                                           | Para quê                                               |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| `E2E_BASE`                               | `http://localhost:3001`                          | Endereço do app.                                       |
| `E2E_APP_CONTAINER` / `E2E_DB_CONTAINER` | `conciliao_dmav2-app-1` / `conciliao_dmav2-db-1` | Nomes dos containers (`docker ps`).                    |
| `E2E_DB_NAME` / `E2E_DB_USER`            | `conciliacao_dma` / `postgres`                   | Banco local.                                           |
| `E2E_BROWSER`                            | Edge ou Chrome instalado                         | Caminho do navegador.                                  |
| `E2E_PORT`                               | `9333`                                           | Porta de depuração do navegador.                       |
| `E2E_ONLY`                               | todos                                            | `fluxos` ou `acessibilidade`, para rodar só uma parte. |

## Segurança

O runner **recusa rodar** se o app não estiver com `MODO_TESTE_API=true`, porque as aprovações seriam reais. Não aponte `E2E_BASE` para produção.

## Limites

Estes testes não substituem o teste manual com leitor de tela (por exemplo NVDA) nem com documentos reais. Se uma tela nova for criada, inclua-a na lista `SCREENS` de `acessibilidade.mjs`.
