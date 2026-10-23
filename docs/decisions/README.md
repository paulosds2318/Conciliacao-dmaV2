# Decisões iniciais

- Stack web full-stack segue o Módulo de Pedágio: Next.js App Router, TypeScript, Prisma/PostgreSQL, Better Auth e CSS institucional Foco.
- A V1 é um aplicativo Windows desktop em Python/Tkinter com API FastAPI; a V2 segue o pedido de aplicação web e a stack do Módulo de Pedágio.
- Ações de negócio herdadas da V1: `Considerar DMA` e `Desconsiderar DMA`.
- Voucher e contrato em PDF são obrigatórios na V2.
- IA compara e aponta evidências; administrador decide.
- A V1 opera em simulação por padrão. URL demonstrativa não representa endpoint de produção.
- Falhas de rede/timeout/5xx em uma alteração podem ser incertas; não repetir automaticamente.
- Execução fica atrás de adaptador e só ocorre após aprovação. Busca individual de contratos não existe na V1 e requer contrato separado com a Coral.