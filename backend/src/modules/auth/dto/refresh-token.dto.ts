// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @Length(64, 512)
  refreshToken!: string;
}
