FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Lint e testes da regra de aprovação automática barram a imagem (e o deploy) quando algo quebra.
RUN npm run lint && npm test
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
WORKDIR /app
# CLI do Prisma para as migrações ao iniciar. Instalada em pasta própria para aplicar o override de segurança do deepmerge-ts;
# mantenha a versão igual à do package.json.
RUN mkdir -p /opt/prisma-cli && cd /opt/prisma-cli \n  && printf '{"private":true,"dependencies":{"prisma":"6.19.3"},"overrides":{"deepmerge-ts":"8.0.2"}}' > package.json \n  && npm install --omit=dev --no-audit --no-fund && npm cache clean --force
ENV PATH="/opt/prisma-cli/node_modules/.bin:$PATH"
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/prisma ./prisma
# O seed (criação do primeiro admin) usa o hash de senha do better-auth, que fica embutido no bundle da
# aplicação e não existe solto no standalone. Mantenha a versão igual à do package-lock.
RUN cd prisma && npm install --no-save --no-package-lock --omit=dev better-auth@1.7.12 && npm cache clean --force
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh \
  && mkdir -p /app/private-uploads && chown -R node:node /app/private-uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]
