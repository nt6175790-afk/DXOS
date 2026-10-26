# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
ui = false
api_addr = "https://openbao:8200"
cluster_addr = "https://openbao:8201"
storage "raft" {
  node_id = "dxos-local-1"
  path = "/openbao/file"
}
listener "tcp" {
  address = "0.0.0.0:8200"
  tls_cert_file = "/openbao/tls/server.crt"
  tls_key_file = "/openbao/tls/server.key"
  tls_min_version = "tls12"
}

audit "file" "file" {
  description = "DX-OS local HMAC audit"
  options {
    file_path = "/openbao/logs/audit.log"
    log_raw = "false"
  }
}
