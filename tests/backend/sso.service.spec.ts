// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';
import { SsoService } from '../../backend/src/modules/auth/sso.service';
import { OidcProvider } from '../../backend/src/modules/auth/oidc.provider';
import { AuthService } from '../../backend/src/modules/auth/auth.service';
import { PrismaService } from '../../backend/src/database/prisma.service';
import { readSsoConfiguration } from '../../backend/src/modules/auth/sso.config';
import type { SsoConfiguration } from '../../backend/src/modules/auth/sso.config';
import type { Configuration } from 'openid-client';

const settings = { SSO_ENABLED: 'true', SSO_ISSUER: 'http://localhost:8180/realms/dxos',
  SSO_CLIENT_ID: 'dxos-web', SSO_REDIRECT_URI: 'http://localhost:5173/auth/sso/callback',
  JWT_ACCESS_SECRET: 'test-only-federation-key-at-least-thirty-two-characters', NODE_ENV: 'test' };

function fixture(overrides = {}) {
  const config = new ConfigService({ ...settings, ...overrides });
  const attempts = new Set<string>();
  const db = {
    oidcLoginAttempt: {
      create: jest.fn(async ({ data }: { data: { stateHash: string } }) => { attempts.add(data.stateHash); }),
      deleteMany: jest.fn(async ({ where }: { where: { stateHash?: string } }) => ({ count: where.stateHash && attempts.delete(where.stateHash) ? 1 : 0 })),
    },
    oidcIdentity: { findUnique: jest.fn().mockResolvedValue({ userId: 'local-user' }) },
  };
  const auth = { loginFederatedUser: jest.fn().mockResolvedValue({ accessToken: 'dxos-token', refreshToken: 'dxos-refresh' }) };
  const provider = { authorize: jest.fn().mockResolvedValue('http://localhost:8180/auth'), subject: jest.fn().mockResolvedValue('external-subject'), logoutUrl: jest.fn().mockResolvedValue('http://localhost:8180/logout') };
  const service = new SsoService(config, db as unknown as PrismaService, auth as unknown as AuthService, provider as unknown as OidcProvider);
  return { service, db, provider, auth };
}

describe('SSO state, federation boundary and configuration', () => {
  afterEach(() => jest.useRealTimers());
  it('is opt-in and returns only safe public configuration', async () => {
    const { service, provider } = fixture({ SSO_ENABLED: 'false' });
    expect(service.info()).toEqual({ enabled: false, providerName: 'SSO doanh nghiệp' });
    await expect(service.start()).rejects.toMatchObject({ status: 404 });
    expect(provider.authorize).not.toHaveBeenCalled();
    await expect(service.logoutUrl()).rejects.toMatchObject({ status: 404 });
    expect(provider.logoutUrl).not.toHaveBeenCalled();
  });
  it('uses unique state/nonce/verifier and keeps verifier sealed', async () => {
    const { service, provider } = fixture();
    const first = await service.start(); const second = await service.start();
    expect(first.state).not.toBe(second.state);
    const [, state, nonce, verifier] = provider.authorize.mock.calls[0] as unknown as string[];
    expect(new Set([state, nonce, verifier]).size).toBe(3);
    expect(JSON.stringify(first)).not.toContain(verifier);
  });
  it('resolves issuer/subject only and reuses the existing session service', async () => {
    const { service, db, auth } = fixture(); const start = await service.start();
    await expect(service.complete({ ...start, code: 'provider-code' })).resolves.toEqual({ accessToken: 'dxos-token', refreshToken: 'dxos-refresh' });
    expect(db.oidcIdentity.findUnique).toHaveBeenCalledWith({ where: { issuer_subject: { issuer: settings.SSO_ISSUER, subject: 'external-subject' } }, select: { userId: true } });
    expect(auth.loginFederatedUser).toHaveBeenCalledWith('local-user');
  });
  it('consumes an attempt once, including simultaneous completion', async () => {
    const { service, auth } = fixture(); const start = await service.start();
    const results = await Promise.allSettled([service.complete({ ...start, code: 'code' }), service.complete({ ...start, code: 'code' })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(auth.loginFederatedUser).toHaveBeenCalledTimes(1);
  });
  it.each(['state', 'challenge'])('rejects tampered %s before contacting the provider', async field => {
    const { service, provider } = fixture(); const start = await service.start();
    await expect(service.complete({ ...start, code: 'code', [field]: 'tampered' })).rejects.toMatchObject({ status: 401 });
    expect(provider.subject).not.toHaveBeenCalled();
  });
  it('rejects expired challenges', async () => {
    jest.useFakeTimers(); const { service, provider } = fixture(); const start = await service.start();
    jest.advanceTimersByTime(300001);
    await expect(service.complete({ ...start, code: 'code' })).rejects.toMatchObject({ status: 401 });
    expect(provider.subject).not.toHaveBeenCalled();
  });
  it('never auto-links an unknown identity or grants permissions', async () => {
    const { service, db, auth } = fixture(); db.oidcIdentity.findUnique.mockResolvedValue(null);
    const start = await service.start();
    await expect(service.complete({ ...start, code: 'code' })).rejects.toMatchObject({ status: 401 });
    expect(auth.loginFederatedUser).not.toHaveBeenCalled();
  });
  it('rejects failed provider verification without creating a session', async () => {
    const { service, provider, auth } = fixture(); provider.subject.mockRejectedValue(new Error('Invalid signed token'));
    const start = await service.start(); await expect(service.complete({ ...start, code: 'code' })).rejects.toThrow();
    expect(auth.loginFederatedUser).not.toHaveBeenCalled();
    await expect(service.complete({ ...start, code: 'code' })).rejects.toMatchObject({ status: 401 });
  });
  it('accepts only the configured browser origin', () => {
    const { service } = fixture(); expect(() => service.assertOrigin('http://localhost:5173')).not.toThrow();
    for (const origin of [undefined, 'null', 'https://evil.test', 'http://localhost:5173.evil.test']) expect(() => service.assertOrigin(origin)).toThrow();
  });
  it.each(['SSO_ISSUER', 'SSO_REDIRECT_URI'])('rejects remote HTTP and HTTP in production: %s', key => {
    expect(() => readSsoConfiguration(new ConfigService({ ...settings, [key]: 'http://evil.test/path' }))).toThrow();
    expect(() => readSsoConfiguration(new ConfigService({ ...settings, NODE_ENV: 'production' }))).toThrow();
  });
});

describe('Trusted OIDC end-session boundary', () => {
  const config = readSsoConfiguration(new ConfigService(settings))!;
  function provider(endpoint?: string) {
    const value = new OidcProvider();
    jest.spyOn(value as unknown as { configuration: (settings: SsoConfiguration) => Promise<Configuration> }, 'configuration')
      .mockResolvedValue({ serverMetadata: () => ({ end_session_endpoint: endpoint }) } as unknown as Configuration);
    return value;
  }
  it('derives a fixed local return URL and exposes no tokens or attacker query', async () => {
    const url = new URL(await provider(settings.SSO_ISSUER + '/logout?post_logout_redirect_uri=https://evil.test&id_token_hint=unexpected').logoutUrl(config));
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:5173/login');
    expect(url.searchParams.get('client_id')).toBe('dxos-web');
    expect(url.searchParams.has('id_token_hint')).toBe(false);
    expect([...url.searchParams.keys()]).toEqual(['client_id', 'post_logout_redirect_uri']);
  });
  it.each([undefined, 'https://evil.test/logout', 'http://user:pass@localhost:8180/logout', settings.SSO_ISSUER + '/logout#fragment'])('refuses unsafe/missing endpoint %s', async endpoint => {
    await expect(provider(endpoint).logoutUrl(config)).rejects.toMatchObject({ status: 503 });
  });
  it('uses the configured provider without trusting client redirect input', async () => {
    const { service, provider } = fixture();
    await expect(service.logoutUrl()).resolves.toEqual({ logoutUrl: 'http://localhost:8180/logout' });
    expect(provider.logoutUrl).toHaveBeenCalledWith(config);
  });
});
