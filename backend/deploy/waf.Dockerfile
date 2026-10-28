# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS build
ENV GOMAXPROCS=2
RUN apk add --no-cache gcc musl-dev
WORKDIR /src/gateway
COPY backend/deploy/waf/gateway/go.mod backend/deploy/waf/gateway/go.sum ./
RUN go mod download && go mod verify
COPY backend/deploy/waf/gateway/*.go ./
COPY backend/deploy/waf/coraza.conf /src/coraza.conf
RUN CGO_ENABLED=1 go test -mod=readonly -race -timeout=180s ./... github.com/corazawaf/coraza/v3/http \
    && go vet -mod=readonly ./... \
    && CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags='-s -w' -o /out/dxos-waf . \
    && go list -mod=readonly -deps . > /out/production-imports.txt \
    && ! grep -E 'go-jose|smallstep|caddyserver' /out/production-imports.txt \
    && go version -m /out/dxos-waf > /out/build-modules.txt \
    && ! grep -E 'go-jose|smallstep|caddyserver' /out/build-modules.txt
FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates
COPY --from=build /out/dxos-waf /usr/local/bin/dxos-waf
COPY --from=build /out/production-imports.txt /out/build-modules.txt /usr/share/dxos-waf/
COPY backend/deploy/waf/coraza.conf /config/coraza.conf
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/dxos-waf"]
