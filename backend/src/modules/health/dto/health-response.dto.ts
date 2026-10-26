// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
export class HealthResponseDto {
  status!: 'ok';
  service!: 'dx-os-api';
  timestamp!: string;
}
