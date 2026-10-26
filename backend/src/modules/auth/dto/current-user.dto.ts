// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import type { UserAccountStatus } from '@prisma/client';

export class CurrentUserDto {
  id!: string;
  email!: string;
  displayName!: string | null;
  accountStatus!: UserAccountStatus;
}
