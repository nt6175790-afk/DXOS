# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0
# Alpine separates the restricted unrar plugin; never install that subpackage.
RUN apk upgrade --no-cache \
    && apk add --no-cache 'clamav-daemon>=1.4.4-r0' 'clamav-scanner>=1.4.4-r0' 'freshclam>=1.4.4-r0' 'brotli-libs>=1.2.1-r0' 'libcurl>=8.23.0-r0' su-exec tini \
    && ! apk info -e clamav-libunrar \
    && test -z "$(find /usr/lib -iname '*unrar*' -print)"
COPY backend/deploy/clamav/clamd.conf /etc/clamav/clamd.conf
COPY backend/deploy/clamav/freshclam.conf /etc/clamav/freshclam.conf
COPY backend/deploy/clamav/start.sh /usr/local/bin/start-clamav
RUN chmod 755 /usr/local/bin/start-clamav && mkdir -p /var/lib/clamav && chown clamav:clamav /var/lib/clamav
USER clamav
EXPOSE 3310
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD printf 'zPING\0' | nc -w 2 127.0.0.1 3310 | grep -q PONG
ENTRYPOINT ["/sbin/tini", "-g", "--", "/usr/local/bin/start-clamav"]
