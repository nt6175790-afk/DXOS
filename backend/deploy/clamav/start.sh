#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
set -eu
if [ "$(id -u)" = 0 ]; then
  mkdir -p /var/lib/clamav
  chown clamav:clamav /var/lib/clamav
  exec su-exec clamav "$0"
fi
if [ ! -f /var/lib/clamav/main.cvd ] && [ ! -f /var/lib/clamav/main.cld ]; then
  freshclam --stdout
fi
freshclam --daemon --foreground --stdout &
updater=$!
clamd --foreground --config-file=/etc/clamav/clamd.conf &
scanner=$!
cleanup() { kill "$updater" "$scanner" 2>/dev/null || true; wait "$updater" "$scanner" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 0' INT TERM
while kill -0 "$updater" 2>/dev/null && kill -0 "$scanner" 2>/dev/null; do sleep 2; done
exit 1
