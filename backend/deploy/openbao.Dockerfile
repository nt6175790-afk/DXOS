# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS build
RUN apk add --no-cache git ca-certificates
RUN git clone --depth 1 --branch v2.7.1 https://github.com/openbao/openbao.git /src \
    && test "$(git -C /src rev-parse HEAD)" = a5db72cef75c24b920ade02065b18dd8eb666bac
WORKDIR /src
# Modified go.mod/go.sum selection is recorded here; upstream MPL terms remain applicable.
RUN go mod edit -replace=golang.org/x/net=golang.org/x/net@v0.60.0 \
    && CGO_ENABLED=0 go build -mod=mod -p=2 -trimpath -ldflags='-s -w' -o /usr/local/bin/bao . \
    && go mod verify
RUN CGO_ENABLED=0 go build -tags=openbao -mod=readonly -p=2 -trimpath \
    -ldflags='-s -w -X github.com/openbao/openbao/v2/internal/version.fullVersion=2.7.1 -X github.com/openbao/openbao/v2/internal/version.VersionMetadata=dxos.1 -X github.com/openbao/openbao/v2/internal/version.GitCommit=a5db72cef75c24b920ade02065b18dd8eb666bac-dxos-net-patch' \
    -o /usr/local/bin/bao .
FROM quay.io/openbao/openbao:2.7.1@sha256:6d2b93856e3fcf7b18ad855a0b51eaba474dc8b79cf554379ea32034797d2acf
USER root
RUN apk upgrade --no-cache
COPY --from=build /usr/local/bin/bao /usr/bin/bao
USER openbao
CMD ["server", "-config=/openbao/config/vault.hcl"]
