# Integrações

## Busca de contrato Coral

Configurada em `CORAL_CONTRACT_LOOKUP_URL`, com o padrão informado: `GET https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}`. A V2 envia `Authorization: Basic ...`, construído no servidor a partir de `CORAL_USERNAME` e `CORAL_PASSWORD`. Isso pressupõe que o Coral aceite HTTP Basic Auth; a documentação disponível da V1 menciona Bearer token, então confirme o formato com o Coral antes de usar a integração real. A resposta precisa ser HTTP 2xx e conter o contrato; 404 significa não encontrado. Como o schema completo do JSON não foi fornecido, o adaptador reconhece campos comuns e deve ser ajustado ao contrato oficial da API.

## Ação DMA Coral

A V1 envia `{ "contrato": "...", "considerar_dma": true|false, "desconsiderar_dma": true|false }` com o formato de autenticação configurado na V2 (HTTP Basic Auth). `CORAL_API_URL` permanece como configuração; o exemplo do repositório V1 era demonstrativo, não é uma URL de produção validada. A execução de produção requer validar URL, autenticação, semântica de resposta e possibilidade de consultar o resultado. Em timeout, falha de rede e HTTP 5xx, a execução fica incerta e não há reenvio automático. A chave de idempotência é registrada internamente; a API legada não documenta suporte a ela.

`CORAL_USERNAME` e `CORAL_PASSWORD` são obrigatórios quando a integração real está habilitada. `MODO_TESTE_API=true` simula busca e execução e é o padrão local. Não altere para `false` até configurar e confirmar a integração real.

## OpenRouter

O backend envia voucher e contrato como arquivos PDF à rota `/api/v1/chat/completions`, com `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`. O resultado estruturado registra campos, correspondências, confiança e resumo. Ele é apenas apoio para decisão humana. Configure um modelo que aceite PDFs. As páginas podem conter dados pessoais e contratuais; acesso aos documentos e à chave fica restrito ao servidor.

## Armazenamento

PDFs são validados por extensão, MIME, tamanho (`MAX_PDF_SIZE_MB`) e assinatura `%PDF-`; armazenados em `DOCUMENT_STORAGE_PATH`, fora de `public`, e disponibilizados por rota autenticada com checagem de proprietário/perfil. Para produção, configure volume persistente, backup e retenção compatível com a política interna.
