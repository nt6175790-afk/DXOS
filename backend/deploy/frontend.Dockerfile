# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
RUN npm run build
FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0
RUN apk upgrade --no-cache && apk add --no-cache 'nginx>=1.28.3-r7' \
    && rm -f /etc/nginx/http.d/default.conf \
    && mkdir -p /usr/share/nginx/html
COPY backend/deploy/frontend.nginx-main.conf /etc/nginx/nginx.conf
COPY backend/deploy/frontend.nginx.conf /etc/nginx/http.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /usr/share/nginx/html/legal/
COPY licenses /usr/share/nginx/html/legal/licenses
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
