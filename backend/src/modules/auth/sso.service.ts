// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import { OidcProvider } from './oidc.provider';
import { readSsoConfiguration } from './sso.config';

interface Challenge { state: string; nonce: string; verifier: string; expires: number; issuer: string; clientId: string; redirectUri: string }

@Injectable()
export class SsoService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService,
    private readonly auth: AuthService, private readonly provider: OidcProvider) { readSsoConfiguration(config); }

  info() { return { enabled: !!readSsoConfiguration(this.config), providerName: 'SSO doanh nghiệp' }; }

  async logoutUrl() { return { logoutUrl: await this.provider.logoutUrl(this.settings()) }; }

  private settings() {
    const settings = readSsoConfiguration(this.config);
    if (!settings) throw new NotFoundException();
    return settings;
  }

  private key() {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret || secret.length < 32) throw new Error('SSO requires JWT_ACCESS_SECRET');
    return createHash('sha256').update('dxos:sso:challenge:v1\0').update(secret).digest();
  }

  async start() {
    const settings = this.settings();
    const challenge: Challenge = { state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'),
      verifier: randomBytes(32).toString('base64url'), expires: Date.now() + 300_000,
      issuer: settings.issuer, clientId: settings.clientId, redirectUri: settings.redirectUri };
    const authorizationUrl = await this.provider.authorize(settings, challenge.state, challenge.nonce, challenge.verifier);
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(challenge)), cipher.final()]);
    const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    // Shared database state makes consumption one-time across backend replicas.
    await this.prisma.oidcLoginAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.oidcLoginAttempt.create({ data: { stateHash: this.hash(challenge.state), expiresAt: new Date(challenge.expires) } });
    return { authorizationUrl, state: challenge.state, challenge: sealed, expiresIn: 300 };
  }

  async complete(input: { code: string; state: string; challenge: string; iss?: string }) {
    const settings = this.settings();
    let challenge: Challenge;
    try {
      const bytes = Buffer.from(input.challenge, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.key(), bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      challenge = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as Challenge;
      if ((input.iss !== undefined && input.iss !== settings.issuer) || challenge.expires <= Date.now() || challenge.state !== input.state || challenge.issuer !== settings.issuer ||
        challenge.clientId !== settings.clientId || challenge.redirectUri !== settings.redirectUri) throw new Error('Invalid challenge');
    } catch { throw new UnauthorizedException('SSO authentication failed.'); }
    const consumed = await this.prisma.oidcLoginAttempt.deleteMany({ where: {
      stateHash: this.hash(input.state), expiresAt: { gt: new Date() },
    } });
    if (consumed.count !== 1) throw new UnauthorizedException('SSO authentication failed.');
    const subject = await this.provider.subject(settings, input.code, input.state, challenge.nonce, challenge.verifier, input.iss);
    const identity = await this.prisma.oidcIdentity.findUnique({ where: {
      issuer_subject: { issuer: settings.issuer, subject },
    }, select: { userId: true } });
    if (!identity) throw new UnauthorizedException('SSO authentication failed.');
    return this.auth.loginFederatedUser(identity.userId);
  }

  assertOrigin(origin?: string) {
    if (!origin || origin !== new URL(this.settings().redirectUri).origin) throw new UnauthorizedException('SSO authentication failed.');
  }
  private hash(state: string) { return createHash('sha256').update(state).digest('hex'); }
}
