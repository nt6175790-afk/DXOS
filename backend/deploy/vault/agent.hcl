# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
pid_file = "/tmp/bao-agent.pid"
vault {
  address = "https://openbao:8200"
  ca_cert = "/run/secrets/openbao_ca"
  retry {
    num_retries = 3
  }
}
auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config {
      role_id_file_path = "/run/approle/role_id"
      secret_id_file_path = "/run/approle/secret_id"
      remove_secret_id_file_after_reading = false
    }
  }
  sink "file" {
    config {
      path = "/openbao/file/token"
      mode = 0640
    }
  }
}
