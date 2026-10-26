// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { PasswordService } from '../../backend/src/modules/auth/password.service';

describe('PasswordService', () => {
  const passwordService = new PasswordService();

  it('creates an Argon2id hash without retaining plaintext', async () => {
    const plaintext = 'Correct horse battery staple 2026!';
    const passwordHash = await passwordService.hash(plaintext);

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toContain(plaintext);
  });

  it('verifies the correct password and rejects an incorrect or malformed hash', async () => {
    const passwordHash = await passwordService.hash('Correct horse battery staple 2026!');

    await expect(passwordService.verify('Correct horse battery staple 2026!', passwordHash)).resolves.toBe(
      true,
    );
    await expect(passwordService.verify('incorrect password', passwordHash)).resolves.toBe(false);
    await expect(passwordService.verify('anything', 'not-an-argon2-hash')).resolves.toBe(false);
  });
});
