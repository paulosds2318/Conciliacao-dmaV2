# Integrações

## Autenticação no Coral

O app usa um usuário de serviço do Coral exclusivo (`CORAL_AUTH_LOGIN`/`CORAL_AUTH_PASSWORD`; em produção, do segredo `foco/office/apps` no Secrets Manager, injetado pela task definition). O módulo `src/lib/server/coral-auth.ts`:

- faz `POST {host do Coral}/api/auth/login` com `{ "login", "password" }` e lê o token em `data.token` (rota configurável em `CORAL_AUTH_URL`);
- guarda o token em memória por 55 minutos (o gate do Coral o aceita por 1 hora) e faz um único login mesmo com várias requisições simultâneas;
- adota o token renovado que o gate devolve no envelope `{ data, token }`;
- se o login responder 4xx (senha errada, usuário desativado), não tenta de novo por 5 minutos, porque o foco-auth desativa o usuário após várias senhas erradas;
- se o login pedir um desafio (`NEW_PASSWORD_REQUIRED` ou MFA), falha com aviso no log: o usuário de serviço precisa ter concluído o primeiro acesso e não pode ter MFA;
- faz login ao subir e a cada 24 horas, porque o foco-auth desativa usuários que passam muitos dias sem login.

Regras do gate do Coral (`foco-node`) que valem para este cliente:

- Um token ativo por usuário: o token vale só se for igual ao último gravado no Redis para o login. Outro login com o mesmo usuário (outra task, Postman) invalida o token do app.
- **401** é dado pelo gate antes do handler: a requisição não foi executada. O cliente descarta o token, faz novo login e repete a chamada uma vez, inclusive o `PUT` de elegibilidade.
- **406** significa que falta a permissão da rota ao usuário.

Não há token ou chave fixa: sem `CORAL_AUTH_LOGIN`/`CORAL_AUTH_PASSWORD`, as chamadas reais ao Coral falham. Em desenvolvimento, use um usuário de homologação.

## Busca de contrato Coral

Configurada em `CORAL_CONTRACT_LOOKUP_URL`, com o padrão `GET https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}`. Exige uma permissão de leitura de contrato (ex.: `RENT_AGREEMENT_VIEW_RENT_AGREEMENT`). 404 significa não encontrado; 406 vira mensagem de permissão; 5xx aponta primeiro para o número (o Coral responde 500 para contrato inexistente); falha de rede vira mensagem de indisponibilidade. Como o schema completo do JSON não foi fornecido, o adaptador reconhece campos comuns e deve ser ajustado ao contrato oficial da API.

## Ação DMA Coral

`PUT /api/rentagreement/dma/eligibility` (`CORAL_DMA_ELIGIBILITY_URL`; `CORAL_API_URL` é alias) com `action` (`REGARD`/`DISREGARD`) e `rentAgreementIds`. Exige a permissão `BULK_UPDATE_DMA_ELIGIBILITY`. Em timeout, falha de rede e HTTP 5xx, a execução fica incerta e não há reenvio automático. A chave de idempotência é registrada internamente; a API não documenta suporte a ela.

`MODO_TESTE_API=true` simula a execução DMA (e a consulta, quando não há credencial do Coral). Não altere para `false` até configurar e confirmar a integração real.

## OpenRouter

O backend envia voucher e contrato como arquivos PDF à rota `/api/v1/chat/completions`, com `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`. O resultado estruturado registra campos, correspondências, confiança e resumo. Ele é apenas apoio para decisão humana. Configure um modelo que aceite PDFs. As páginas podem conter dados pessoais e contratuais; acesso aos documentos e à chave fica restrito ao servidor.

## Armazenamento

PDFs são validados por extensão, MIME, tamanho (`MAX_PDF_SIZE_MB`) e assinatura `%PDF-`; armazenados em `DOCUMENT_STORAGE_PATH`, fora de `public`, e disponibilizados por rota autenticada com checagem de proprietário/perfil. Para produção, configure volume persistente, backup e retenção compatível com a política interna.

## Situação de DMA e premiável na consulta do contrato

A consulta do contrato no Coral (`GET /api/rentagreement/{CONTRATO}`) traz, na raiz de `data`, os campos que o app lê na tela de consulta de DMA:

| Campo do Coral | Significado | O app mostra |
|---|---|---|
| `regardDma` verdadeiro | "Considerar DMA" marcado na edição do contrato. Força o contrato a contar no DMA e vence as outras regras, inclusive `dma = true`. Só essa tela o marca; a ação `REGARD` do endpoint **não** o define. | Considerar DMA |
| `dma` verdadeiro (com `regardDma` falso) | Contrato desconsiderado. A ação `DISREGARD` grava `dma = true` e zera `regardDma`. | Desconsiderar DMA |
| `dma` e `regardDma` falsos | Sem ação de DMA (padrão). É o estado em que um contrato fica depois de um `REGARD` feito pelo app, porque `REGARD` só grava `dma = false`. | Sem ação de DMA (padrão) |

Consequência para a operação: **"Considerar DMA" pelo app desfaz a desconsideração, mas não marca o "Considerar DMA" da edição do contrato**. Depois de um `DISREGARD`, o `REGARD` não devolve o `regardDma` que existia antes.

**Premiável:** vem do `awardable` do acordo comercial do contrato, em `cdpData.awardable` (`"yes"` ou `"no"`). O `awardable` da raiz da resposta e o de `optionals` não valem para isso.

Conferido na homologação (REC000605-26 e REC001097-26, ambos com acordo `2DIRIGEM`): padrão e desconsiderado, os dois premiáveis, batendo com a tela do Coral. O caso `regardDma = true` segue a regra informada pela equipe do Coral e ainda não foi visto num contrato real; para vê-lo na homologação, marque "Considerar DMA" na edição de um contrato (exige a permissão `EDIT_*_REGARD_DMA`).
