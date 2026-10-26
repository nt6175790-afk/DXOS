// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  AUTH_RATE_LIMIT_SCOPES,
  AuthRateLimitService,
  type RateLimitResponse,
} from '../../backend/src/modules/auth/auth-rate-limit.service';
import {
  RateLimitStoreUnavailableError,
  type RateLimitIncrement,
  type RateLimitStore,
} from '../../backend/src/modules/auth/auth-rate-limit.store';
import { ApiErrorException } from '../../backend/src/common/errors/api-error.exception';

function config(values: Partial<Record<string, number>> = {}): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue({
      rateLimitLoginLimit: values.loginLimit ?? 2,
      rateLimitLoginWindowSeconds: values.loginWindowSeconds ?? 60,
      rateLimitRefreshLimit: values.refreshLimit ?? 3,
      rateLimitRefreshWindowSeconds: values.refreshWindowSeconds ?? 60,
    }),
  } as unknown as ConfigService;
}

function request(remoteAddress: string, headers: Record<string, string> = {}) {
  return { socket: { remoteAddress }, headers } as never;
}

class SharedAtomicStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number): Promise<RateLimitIncrement> {
    await Promise.resolve();
    const now = Date.now();
    const current = this.buckets.get(key);
    const bucket = !current || now >= current.resetAt
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    this.buckets.set(key, bucket);
    return {
      count: bucket.count,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }
}

class FailingStore implements RateLimitStore {
  async increment(): Promise<RateLimitIncrement> {
    throw new RateLimitStoreUnavailableError();
  }
}

describe('AuthRateLimitService', () => {
  let now: number;
  let response: RateLimitResponse & { setHeader: jest.Mock };

  beforeEach(() => {
    now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    response = { setHeader: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows requests below the limit and rejects the next request with Retry-After', async () => {
    const service = new AuthRateLimitService(config());
    const source = request('::ffff:203.0.113.10');

    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response)).resolves.toBeUndefined();
    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response)).resolves.toBeUndefined();

    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response))
      .rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('shares the global counter between independent instances', async () => {
    const sharedStore = new SharedAtomicStore();
    const instanceA = new AuthRateLimitService(config({ loginLimit: 10 }), sharedStore);
    const instanceB = new AuthRateLimitService(config({ loginLimit: 10 }), sharedStore);
    const source = request('203.0.113.11');

    for (let index = 0; index < 5; index += 1) {
      await instanceA.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response);
      await instanceB.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response);
    }

    await expect(instanceA.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response))
      .rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('counts concurrent requests atomically across instances', async () => {
    const sharedStore = new SharedAtomicStore();
    const instanceA = new AuthRateLimitService(config({ loginLimit: 10 }), sharedStore);
    const instanceB = new AuthRateLimitService(config({ loginLimit: 10 }), sharedStore);
    const source = request('203.0.113.12');
    const outcomes = await Promise.allSettled(
      Array.from({ length: 11 }, (_, index) =>
        (index % 2 === 0 ? instanceA : instanceB).enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response)),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(10);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
  });

  it('resets a bucket after its window and keeps login and refresh scopes separate', async () => {
    const service = new AuthRateLimitService(config());
    const source = request('203.0.113.13');

    await service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response);
    await service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response);
    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response))
      .rejects.toBeInstanceOf(ApiErrorException);

    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.REFRESH, source, response)).resolves.toBeUndefined();
    now = 60_000;
    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, source, response)).resolves.toBeUndefined();
  });

  it('does not use spoofable forwarding headers', async () => {
    const service = new AuthRateLimitService(config({ loginLimit: 1 }));
    const first = request('not-an-ip', { 'x-forwarded-for': '203.0.113.20' });
    const second = request('not-an-ip', { 'x-forwarded-for': '203.0.113.21' });

    await service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, first, response);
    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, second, response))
      .rejects.toBeInstanceOf(ApiErrorException);
  });

  it('fails closed for protected endpoints when the shared store is unavailable', async () => {
    const service = new AuthRateLimitService(config(), new FailingStore());

    await expect(service.enforce(AUTH_RATE_LIMIT_SCOPES.LOGIN, request('203.0.113.14'), response))
      .rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
      });
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
