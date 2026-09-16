FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY services/monad/package.json services/monad/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY services/monad ./services/monad
COPY config ./config
COPY scripts/monad-factories.mjs ./scripts/monad-factories.mjs
USER node
EXPOSE 3001
CMD ["node","services/monad/server.mjs"]
