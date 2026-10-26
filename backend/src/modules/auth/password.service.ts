// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

const passwordHashingOptions: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

@Injectable()
export class PasswordService {
  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, passwordHashingOptions);
  }

  async verify(plaintext: string, passwordHash: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, plaintext);
    } catch {
      return false;
    }
  }

  async consumeVerificationCost(plaintext: string): Promise<void> {
    await argon2.hash(plaintext, passwordHashingOptions);
  }
}
