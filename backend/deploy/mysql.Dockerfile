# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS gosu-build
RUN apk add --no-cache git ca-certificates
RUN git clone --depth 1 --branch 1.19 https://github.com/tianon/gosu.git /src \
    && test "$(git -C /src rev-parse HEAD)" = 6456aaa0f3c854d199d0f037f068eb97515b7513
WORKDIR /src
RUN CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags='-d -w' -o /out/gosu . \
    && go mod verify

FROM mysql:8.0.44@sha256:9c3380eac945af0736031b200027f581925927c81e010056214a4bd6b6693714
# Shell's bundled Python is not required by mysqld, mysql client or the entrypoint.
# Preserve the exact server version while applying Oracle Linux security fixes.
RUN microdnf remove -y mysql-shell \
    && sed -i '/^\[/a excludepkgs=mysql*' /etc/yum.repos.d/*.repo \
    && microdnf upgrade -y \
    && microdnf clean all \
    && mysqld --version | grep -E 'Ver 8\.0\.44([ .]|$)'
COPY --from=gosu-build /out/gosu /usr/local/bin/gosu
RUN gosu --version && gosu mysql id
USER mysql
