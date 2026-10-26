// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';

export interface SsoConfiguration { issuer: string; clientId: string; clientSecret?: string; redirectUri: string; insecure: boolean; backchannelOrigin?: string }

export function readSsoConfiguration(config: ConfigService): SsoConfiguration | undefined {
  const enabled = config.get<string>('SSO_ENABLED') ?? 'false';
  if (!['true', 'false'].includes(enabled)) throw new Error('Invalid SSO_ENABLED');
  if (enabled === 'false') return undefined;
  const issuer = config.get<string>('SSO_ISSUER') ?? '';
  const redirectUri = config.get<string>('SSO_REDIRECT_URI') ?? '';
  const clientId = config.get<string>('SSO_CLIENT_ID') ?? '';
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(clientId)) throw new Error('Invalid SSO_CLIENT_ID');
  const production = (config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) === 'production';
  for (const [name, value] of [['SSO_ISSUER', issuer], ['SSO_REDIRECT_URI', redirectUri]]) {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`Invalid ${name}`); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (value.length > 191 || url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !production))) throw new Error(`Invalid ${name}`);
  }
  if (issuer.endsWith('/')) throw new Error('SSO_ISSUER must not end in a slash');
  const backchannelOrigin = config.get<string>('SSO_BACKCHANNEL_ORIGIN') || undefined;
  if (backchannelOrigin) {
    const target = new URL(backchannelOrigin);
    if (target.origin !== backchannelOrigin || target.username || target.password ||
      (target.protocol !== 'https:' && !(target.protocol === 'http:' && !production))) throw new Error('Invalid SSO_BACKCHANNEL_ORIGIN');
  }
  return { issuer, redirectUri, clientId, clientSecret: config.get<string>('SSO_CLIENT_SECRET') || undefined,
    insecure: issuer.startsWith('http:'), backchannelOrigin };
}
