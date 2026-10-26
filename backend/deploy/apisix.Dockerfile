# SPDX-FileCopyrightText: 2026 DX-OS contributors
# SPDX-License-Identifier: Apache-2.0
FROM apache/apisix:3.19.0-ubuntu@sha256:bb4958b943949b3543353481eff1333e10b3323c6095dd0af4406de2b8cf738e
USER root
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
USER apisix
