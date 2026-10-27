# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
RUN apk upgrade --no-cache && apk add --no-cache openssl ca-certificates python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --no-audit --no-fund
COPY database database
COPY backend backend
RUN npm run db:generate && npm run build:backend

FROM build AS demo-tools
RUN mkdir -p /data/files && chown node:node /data/files
USER node
ENV NODE_ENV=development
CMD ["node", "backend/scripts/demo-bootstrap.js"]

FROM build AS runtime-dependencies
# PDF.js uses the MIT-licensed platform canvas binding for Node geometry primitives.
# Keep installed runtime optional dependencies; dev dependencies are still removed.
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
RUN apk upgrade --no-cache && apk add --no-cache openssl ca-certificates \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p /data/files && chown node:node /data/files
WORKDIR /app
COPY --from=runtime-dependencies --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/backend/dist backend/dist
COPY --from=build --chown=node:node /app/backend/package.json backend/package.json
COPY --chown=node:node LICENSE NOTICE THIRD_PARTY_NOTICES.md /app/legal/
COPY --chown=node:node licenses /app/legal/licenses
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
