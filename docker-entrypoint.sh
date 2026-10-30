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

exec node server.js
