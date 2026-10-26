// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Configuration } from 'openid-client';
import type { SsoConfiguration } from './sso.config';

@Injectable()
export class OidcProvider {
  private cached?: { key: string; config: Configuration; expires: number };

  private async configuration(settings: SsoConfiguration): Promise<Configuration> {
    // Lazy import: openid-client is ESM; Node >=22.12 supports require(ESM).
    const client = await import('openid-client');
    const key = JSON.stringify(settings);
    if (this.cached?.key === key && this.cached.expires > Date.now()) return this.cached.config;
    try {
      const safeFetch: import('openid-client').CustomFetch = (url, options) => {
        const target = new URL(url.toString());
        if (target.origin !== new URL(settings.issuer).origin) throw new Error('Unexpected OIDC origin');
        if (settings.backchannelOrigin) {
          const backchannel = new URL(settings.backchannelOrigin);
          target.protocol = backchannel.protocol; target.host = backchannel.host;
        }
        return fetch(target, { ...options, redirect: 'error' });
      };
      const config = await client.discovery(new URL(settings.issuer), settings.clientId,
        { id_token_signed_response_alg: 'RS256' },
        settings.clientSecret ? client.ClientSecretPost(settings.clientSecret) : client.None(),
        { timeout: 5, [client.customFetch]: safeFetch, execute: settings.insecure ? [client.allowInsecureRequests] : [] });
      const metadata = config.serverMetadata();
      for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri]) {
        if (!endpoint || new URL(endpoint).origin !== new URL(settings.issuer).origin) throw new Error('Unexpected OIDC endpoint');
      }
      // Verify the ID token signature as well as issuer, audience, nonce and expiry.
      client.enableNonRepudiationChecks(config);
      this.cached = { key, config, expires: Date.now() + 300_000 };
      return config;
    } catch { throw new ServiceUnavailableException('SSO provider unavailable.'); }
  }

  async authorize(settings: SsoConfiguration, state: string, nonce: string, verifier: string): Promise<string> {
    const client = await import('openid-client');
    const config = await this.configuration(settings);
    return client.buildAuthorizationUrl(config, { redirect_uri: settings.redirectUri, scope: 'openid',
      response_type: 'code', state, nonce, code_challenge_method: 'S256',
      code_challenge: await client.calculatePKCECodeChallenge(verifier) }).href;
  }

  async logoutUrl(settings: SsoConfiguration): Promise<string> {
    const config = await this.configuration(settings);
    try {
      const value = config.serverMetadata().end_session_endpoint;
      if (!value) throw new Error('Missing end-session endpoint');
      const target = new URL(value);
      if (target.origin !== new URL(settings.issuer).origin || target.username || target.password || target.hash) throw new Error('Unsafe end-session endpoint');
      target.search = '';
      target.searchParams.set('client_id', settings.clientId);
      target.searchParams.set('post_logout_redirect_uri', new URL('/login', settings.redirectUri).href);
      return target.href;
    } catch { throw new ServiceUnavailableException('SSO logout unavailable.'); }
  }

  async subject(settings: SsoConfiguration, code: string, state: string, nonce: string, verifier: string, responseIssuer?: string): Promise<string> {
    const client = await import('openid-client');
    const config = await this.configuration(settings);
    const callback = new URL(settings.redirectUri);
    callback.searchParams.set('code', code); callback.searchParams.set('state', state);
    if (responseIssuer !== undefined) callback.searchParams.set('iss', responseIssuer);
    try {
      const tokens = await client.authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: verifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true,
      });
      const subject = tokens.claims()?.sub;
      if (typeof subject !== 'string' || !/^[\x21-\x7E]{1,191}$/.test(subject)) throw new Error('Invalid subject');
      // No provider tokens, emails, roles or groups cross this boundary.
      return subject;
    } catch { throw new UnauthorizedException('SSO authentication failed.'); }
  }
}
