# Arquitetura inicial

Stack base: Next.js App Router, React, TypeScript, Prisma/PostgreSQL e Better Auth, seguindo o Módulo de Pedágio. A navegação e identidade visual usam os assets e estilos Foco daquele projeto.

## Domínios

- `auth`: sessão e perfis atendente e administrador.
- `requests`: criação e ciclo de vida da solicitação.
- `contracts`: validação e busca no Coral.
- `documents`: validação dos dois PDFs, armazenamento privado e visualização autorizada.
- `analysis`: extração e comparação assistida por modelo OpenRouter.
- `reviews`: fila, aprovação e recusa justificada.
- `audit`: histórico de transições e decisões.
- `execution`: adaptador idempotente acionado só após aprovação.

A análise da IA é subsídio para o administrador, não uma decisão automática. O banco guarda a versão dos documentos analisados para invalidar a aprovação se o conteúdo for substituído.
