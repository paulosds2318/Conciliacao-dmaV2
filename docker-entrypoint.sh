#!/bin/sh
# Aplica as migrações versionadas e inicia a aplicação.
# Bancos criados antes das migrações (via "prisma db push") são sincronizados uma única vez
# e registrados com a migração inicial, sem apagar dados.
set -e

if output=$(prisma migrate deploy 2>&1); then
  echo "$output"
else
  echo "$output"
  if echo "$output" | grep -q "P3005"; then
    echo "[migrate] Banco existente sem histórico de migrações: sincronizando e registrando 0_init."
    prisma db push --skip-generate
    prisma migrate resolve --applied 0_init
    prisma migrate deploy
  else
    echo "[migrate] Falha ao aplicar migrações; a aplicação não será iniciada."
    exit 1
  fi
fi

# Contas iniciais: com SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD (ou o par do atendente) definidos, cria as que ainda
# não existem. Contas existentes não são alteradas. Sem as variáveis, nada acontece.
if { [ -n "$SEED_ADMIN_EMAIL" ] && [ -n "$SEED_ADMIN_PASSWORD" ]; } || { [ -n "$SEED_ATTENDANT_EMAIL" ] && [ -n "$SEED_ATTENDANT_PASSWORD" ]; }; then
  if ! node --experimental-strip-types --no-warnings prisma/seed.ts --if-missing; then
    echo "[seed] Falha ao preparar as contas iniciais; a aplicação não será iniciada."
    exit 1
  fi
fi

exec node server.js
