# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS build
ENV GOMAXPROCS=2
RUN apk add --no-cache git ca-certificates
RUN git clone --depth 1 --branch v2.7.2 https://github.com/openbao/openbao.git /src \
    && test "$(git -C /src rev-parse HEAD)" = 9e0a0d3c3504a0a00b45e61355afac5e35c78379
COPY backend/deploy/jose-migrate /tools/jose-migrate-src
RUN go build -o /tools/jose-migrate /tools/jose-migrate-src/main.go \
    && go mod download github.com/hashicorp/cap@v0.14.0 github.com/okta/okta-sdk-golang/v2@v2.20.0 \
    && mkdir -p /deps \
    && cp -r /go/pkg/mod/github.com/hashicorp/cap@v0.14.0 /deps/cap \
    && cp -r /go/pkg/mod/github.com/okta/okta-sdk-golang/v2@v2.20.0 /deps/okta \
    && chmod -R u+w /deps \
    && /tools/jose-migrate /deps/cap /deps/okta
WORKDIR /deps/cap
RUN go mod edit -droprequire=github.com/go-jose/go-jose/v3 -require=github.com/go-jose/go-jose/v4@v4.1.6 \
    && go test -mod=mod -p=2 ./jwt ./oidc/... github.com/go-jose/go-jose/v4/... && go mod verify
WORKDIR /deps/okta
RUN go mod edit -droprequire=github.com/go-jose/go-jose/v3 -require=github.com/go-jose/go-jose/v4@v4.1.6 \
    && OKTA_CLIENT_ORGURL=https://example.okta.test OKTA_CLIENT_TOKEN=synthetic-unit-fixture-token go test -mod=mod -p=2 -timeout=180s ./tests/unit/... ./okta/... && go mod verify
WORKDIR /src
# Upstream MPL/Apache source licenses remain applicable; adapters and pinned inputs ship as source.
RUN go mod edit -replace=golang.org/x/net=golang.org/x/net@v0.60.0 \
    -replace=github.com/hashicorp/cap=/deps/cap \
    -replace=github.com/okta/okta-sdk-golang/v2=/deps/okta \
    -require=github.com/go-jose/go-jose/v4@v4.1.6 \
    && CGO_ENABLED=0 go build -tags=openbao -mod=mod -p=2 -trimpath \
    -ldflags='-s -w -X github.com/openbao/openbao/v2/internal/version.fullVersion=2.7.2 -X github.com/openbao/openbao/v2/internal/version.VersionMetadata=dxos.2 -X github.com/openbao/openbao/v2/internal/version.GitCommit=9e0a0d3c3504a0a00b45e61355afac5e35c78379-dxos-jose-v4' \
    -o /usr/local/bin/bao . \
    && go mod verify \
    && go version -m /usr/local/bin/bao > /tmp/bao-modules.txt \
    && ! grep -q 'github.com/go-jose/go-jose/v3' /tmp/bao-modules.txt \
    && grep -q 'github.com/go-jose/go-jose/v4.*v4.1.6' /tmp/bao-modules.txt
FROM quay.io/openbao/openbao:2.7.2@sha256:5046911075e137e154ce49ab051502f4ec7cf367d484ae4a4dce665d9b90561f
USER root
RUN apk upgrade --no-cache
COPY --from=build /usr/local/bin/bao /usr/bin/bao
USER openbao
CMD ["server", "-config=/openbao/config/vault.hcl"]
