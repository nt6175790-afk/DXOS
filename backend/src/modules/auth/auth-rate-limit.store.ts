// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import type { AppConfiguration } from '../../config/environment';

export interface RateLimitIncrement {
  count: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitIncrement>;
}

export class RateLimitStoreUnavailableError extends Error {
  constructor() {
    super('The shared authentication rate-limit store is unavailable.');
    this.name = 'RateLimitStoreUnavailableError';
  }
}

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const MAX_MEMORY_BUCKETS = 10_000;
const MEMORY_CLEANUP_INTERVAL_MS = 1_000;

/**
 * Development/test fallback only. Production configuration requires REDIS_URL,
 * so production enforcement always uses the shared Redis store.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, MemoryBucket>();
  private lastCleanupAt = 0;

  async increment(key: string, windowMs: number): Promise<RateLimitIncrement> {
    const now = Date.now();
    this.cleanup(now);

    const current = this.buckets.get(key);
    const bucket = !current || now >= current.resetAt
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };

    this.buckets.set(key, bucket);
    this.trimToBound();

    return {
      count: bucket.count,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < MEMORY_CLEANUP_INTERVAL_MS && this.buckets.size <= MAX_MEMORY_BUCKETS) return;

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    this.lastCleanupAt = now;
    this.trimToBound();
  }

  private trimToBound(): void {
    while (this.buckets.size > MAX_MEMORY_BUCKETS) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.buckets.delete(oldest);
    }
  }
}

const ATOMIC_INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class AuthRateLimitStore implements RateLimitStore {
  private readonly fallback: InMemoryRateLimitStore;
  private readonly redisClient?: RedisClient;
  private connectPromise?: Promise<void>;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<AppConfiguration>('app');
    this.fallback = new InMemoryRateLimitStore();

    if (config.redisUrl) {
      this.redisClient = createClient({
        url: config.redisUrl,
        socket: {
          connectTimeout: 1_000,
          reconnectStrategy: false,
        },
      });
      // Consume asynchronous client errors. Request failures are converted to
      // a safe 503 by the service instead of exposing infrastructure details.
      this.redisClient.on('error', () => undefined);
    }
  }

  async increment(key: string, windowMs: number): Promise<RateLimitIncrement> {
    if (!this.redisClient) return this.fallback.increment(key, windowMs);

    try {
      await this.ensureConnected();
      const result = await this.redisClient.sendCommand([
        'EVAL',
        ATOMIC_INCREMENT_SCRIPT,
        '1',
        key,
        String(windowMs),
      ]) as unknown as [number | string, number | string];

      const count = Number(result[0]);
      const ttlMs = Number(result[1]);
      if (!Number.isSafeInteger(count) || !Number.isFinite(ttlMs) || ttlMs < 0) {
        throw new Error('Invalid rate-limit store response.');
      }

      return {
        count,
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1_000)),
      };
    } catch {
      throw new RateLimitStoreUnavailableError();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient?.isOpen) {
      await this.redisClient.quit().catch(() => undefined);
    }
  }

  private async ensureConnected(): Promise<void> {
    const client = this.redisClient;
    if (!client) return;
    if (client.isReady) return;

    if (!this.connectPromise) {
      this.connectPromise = client.connect().then(() => undefined).finally(() => {
        this.connectPromise = undefined;
      });
    }

    await this.connectPromise;
    if (!client.isReady) throw new RateLimitStoreUnavailableError();
  }
}
