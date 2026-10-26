// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];
export const AI_PROVIDERS = ['mock', 'ollama', 'vllm', 'openai', 'gemini', 'disabled'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];
/** Providers served through the shared OpenAI-compatible adapter (open-weight models). */
export const OPEN_WEIGHT_AI_PROVIDERS: readonly AiProviderName[] = ['ollama', 'vllm'];
const OLLAMA_CLOUD_HOST = 'ollama.com';

export interface AppConfiguration {
  environment: NodeEnvironment;
  port: number;
  apiPrefix: string;
  logLevel: LogLevel;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  databaseUrl?: string;
  redisUrl?: string;
  jwtAccessSecret?: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
  aiProvider: AiProviderName;
  aiModel: string;
  aiApiKey?: string;
  aiTimeoutMs: number;
  /** OpenAI-compatible endpoint for `ollama`/`vllm`; server configuration only, never from requests. */
  aiBaseUrl?: string;
  aiReasoningEffort: 'low' | 'medium' | 'high';
  aiAgentMaxSteps: number;
  aiAgentTotalTimeoutMs: number;
  rateLimitLoginLimit: number;
  rateLimitLoginWindowSeconds: number;
  rateLimitRefreshLimit: number;
  rateLimitRefreshWindowSeconds: number;
}

type EnvironmentSource = Record<string, string | undefined>;

const developmentCorsOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function configurationError(name: string, reason: string): never {
  throw new Error('Invalid environment variable ' + name + ': ' + reason);
}

function readEnum<T extends readonly string[]>(
  source: EnvironmentSource,
  name: string,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  const value = source[name] ?? fallback;

  if (!allowedValues.includes(value as T[number])) {
    configurationError(name, 'must be one of: ' + allowedValues.join(', '));
  }

  return value as T[number];
}

function readPort(source: EnvironmentSource): number {
  const value = source.PORT ?? '3000';

  if (!/^\d+$/.test(value)) {
    configurationError('PORT', 'must be an integer between 1 and 65535');
  }

  const port = Number.parseInt(value, 10);
  if (port < 1 || port > 65535) {
    configurationError('PORT', 'must be an integer between 1 and 65535');
  }

  return port;
}

function readApiPrefix(source: EnvironmentSource): string {
  const value = source.API_PREFIX ?? 'api/v1';

  if (!/^[a-z0-9]+(?:\/[a-z0-9]+)*$/.test(value)) {
    configurationError('API_PREFIX', 'must contain lowercase path segments without leading or trailing slashes');
  }

  return value;
}

function readBoolean(source: EnvironmentSource, name: string, fallback: boolean): boolean {
  const value = source[name];

  if (value === undefined || value === '') {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  configurationError(name, 'must be true or false');
}

function parseCorsOrigins(value: string): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    configurationError('CORS_ORIGINS', 'must contain at least one origin');
  }

  return origins.map((origin) => {
    if (origin === '*') {
      configurationError('CORS_ORIGINS', 'wildcard origins are not supported');
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      configurationError('CORS_ORIGINS', origin + ' is not a valid origin');
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      configurationError('CORS_ORIGINS', origin + ' must be an http(s) origin without a path');
    }

    return origin;
  });
}

function readDatabaseUrl(source: EnvironmentSource, environment: NodeEnvironment): string | undefined {
  const value = source.DATABASE_URL;

  if (!value) {
    if (environment === 'test') {
      return undefined;
    }

    configurationError('DATABASE_URL', 'is required outside the test environment');
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    configurationError('DATABASE_URL', 'must be a valid MySQL connection URL');
  }

  if (parsed.protocol !== 'mysql:' || parsed.pathname === '/') {
    configurationError('DATABASE_URL', 'must be a MySQL connection URL with a database name');
  }

  return value;
}

function readRedisUrl(source: EnvironmentSource, environment: NodeEnvironment): string | undefined {
  const value = source.REDIS_URL;

  if (!value) {
    if (environment === 'production') {
      configurationError('REDIS_URL', 'is required in production for distributed authentication rate limiting');
    }
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    configurationError('REDIS_URL', 'must be a valid Redis connection URL');
  }

  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    configurationError('REDIS_URL', 'must use the redis:// or rediss:// scheme');
  }

  return value;
}

function readJwtAccessSecret(source: EnvironmentSource, environment: NodeEnvironment): string | undefined {
  const value = source.JWT_ACCESS_SECRET;

  if (!value) {
    if (environment === 'test') {
      return undefined;
    }

    configurationError('JWT_ACCESS_SECRET', 'is required outside the test environment');
  }

  if (value.length < 32 || value === 'replace-before-enabling-authentication') {
    configurationError('JWT_ACCESS_SECRET', 'must be a non-default secret of at least 32 characters');
  }

  return value;
}

function readDurationSeconds(
  source: EnvironmentSource,
  name: string,
  fallback: string,
  minimumSeconds: number,
  maximumSeconds: number,
): number {
  const value = source[name] ?? fallback;
  const match = /^(\d+)(s|m|h|d)$/.exec(value);

  if (!match) {
    configurationError(name, 'must use a positive duration with s, m, h, or d suffix');
  }

  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };
  const seconds = Number.parseInt(match[1], 10) * multipliers[match[2]];

  if (!Number.isSafeInteger(seconds) || seconds < minimumSeconds || seconds > maximumSeconds) {
    configurationError(name, `must be between ${minimumSeconds} and ${maximumSeconds} seconds`);
  }

  return seconds;
}

function readBoundedInteger(
  source: EnvironmentSource,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = source[name] ?? String(fallback);

  if (!/^\d+$/.test(value)) {
    configurationError(name, `must be an integer between ${minimum} and ${maximum}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    configurationError(name, `must be an integer between ${minimum} and ${maximum}`);
  }

  return parsed;
}

const DEFAULT_AI_MODELS: Record<AiProviderName, string> = {
  mock: 'mock-v1', disabled: 'mock-v1', openai: 'gpt-4o-mini', gemini: 'gemini-1.5-flash',
  ollama: 'gpt-oss:120b', vllm: 'openai/gpt-oss-120b',
};

function readAiModel(source: EnvironmentSource, provider: AppConfiguration['aiProvider']): string {
  const value = source.AI_MODEL ?? DEFAULT_AI_MODELS[provider];
  // '/' is allowed only for open-weight servers (vLLM serves Hugging Face ids such as openai/gpt-oss-120b).
  const pattern = OPEN_WEIGHT_AI_PROVIDERS.includes(provider) ? /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/ : /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
  if (value.length < 1 || value.length > 100 || !pattern.test(value) || value.includes('..') || value.includes('//')) {
    configurationError('AI_MODEL', 'must be a safe model identifier');
  }
  if (provider === 'mock' && value !== 'mock-v1') {
    configurationError('AI_MODEL', 'must be mock-v1 when AI_PROVIDER is mock or disabled');
  }
  return value;
}

function readAiApiKey(source: EnvironmentSource, provider: AppConfiguration['aiProvider'], environment: NodeEnvironment): string | undefined {
  let value: string | undefined;
  if (provider === 'openai') {
    value = source.AI_API_KEY ?? source.OPENAI_API_KEY;
  } else if (provider === 'gemini') {
    value = source.AI_API_KEY ?? source.GEMINI_API_KEY;
  } else {
    value = source.AI_API_KEY;
  }
  if ((provider === 'openai' || provider === 'gemini') && environment !== 'test' && !value && source.ALLOW_EMPTY_AI_KEY !== 'true') {
    configurationError('AI_API_KEY', 'is required when AI_PROVIDER is ' + provider);
  }
  if (value !== undefined && (value.length < 1 || value.length > 4096 || /\s/.test(value))) {
    configurationError('AI_API_KEY', 'must be a non-empty value');
  }
  return value;
}

/**
 * Endpoint of an OpenAI-compatible server (Ollama or vLLM), e.g. https://ollama.com/v1.
 * Read from server configuration only; validated at startup so a bad value stops the process (SSRF guard).
 */
function readAiBaseUrl(source: EnvironmentSource, provider: AppConfiguration['aiProvider']): string | undefined {
  if (!OPEN_WEIGHT_AI_PROVIDERS.includes(provider)) return undefined;
  const raw = source.AI_BASE_URL ?? (provider === 'ollama' ? 'http://localhost:11434/v1' : undefined);
  if (!raw) configurationError('AI_BASE_URL', 'is required when AI_PROVIDER is ' + provider);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    configurationError('AI_BASE_URL', 'must be an absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || raw.length > 2048) {
    configurationError('AI_BASE_URL', 'must be an http(s) URL without credentials, query or fragment');
  }
  return url.toString().replace(/\/+$/, '');
}

export function isOllamaCloudUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).hostname === OLLAMA_CLOUD_HOST;
  } catch {
    return false;
  }
}

export function getAppConfiguration(source: EnvironmentSource = process.env): AppConfiguration {
  const environment = readEnum(source, 'NODE_ENV', NODE_ENVIRONMENTS, 'development');
  const corsOriginsValue = source.CORS_ORIGINS;

  if (environment === 'production' && !corsOriginsValue) {
    configurationError('CORS_ORIGINS', 'is required in production');
  }

  const corsOrigins = parseCorsOrigins(corsOriginsValue ?? developmentCorsOrigins.join(','));
  const rateLimitDefaults = environment === 'production'
    ? { loginLimit: 10, refreshLimit: 30 }
    : { loginLimit: 100, refreshLimit: 300 };

  const aiProvider = readEnum(source, 'AI_PROVIDER', AI_PROVIDERS, environment === 'production' ? 'disabled' : 'mock');
  const openWeight = OPEN_WEIGHT_AI_PROVIDERS.includes(aiProvider);
  // A 120B model with tool calls needs more than the 5 s default used for hosted APIs.
  const aiTimeoutMs = readBoundedInteger(source, 'AI_TIMEOUT_MS', openWeight ? 30000 : 5000, 1, 30000);
  const aiBaseUrl = readAiBaseUrl(source, aiProvider);
  const aiApiKey = readAiApiKey(source, aiProvider, environment);
  if (aiProvider === 'ollama' && isOllamaCloudUrl(aiBaseUrl) && !aiApiKey && environment !== 'test') {
    configurationError('AI_API_KEY', 'is required for Ollama Cloud');
  }

  return {
    environment,
    aiProvider,
    aiModel: readAiModel(source, aiProvider),
    aiApiKey,
    aiTimeoutMs,
    aiBaseUrl,
    aiReasoningEffort: readEnum(source, 'AI_REASONING_EFFORT', ['low', 'medium', 'high'] as const, 'low'),
    aiAgentMaxSteps: readBoundedInteger(source, 'AI_AGENT_MAX_STEPS', 3, 1, 5),
    aiAgentTotalTimeoutMs: readBoundedInteger(source, 'AI_AGENT_TOTAL_TIMEOUT_MS', 45_000, 1_000, 120_000),
    rateLimitLoginLimit: readBoundedInteger(source, 'RATE_LIMIT_LOGIN_LIMIT', rateLimitDefaults.loginLimit, 1, 10_000),
    rateLimitLoginWindowSeconds: readBoundedInteger(source, 'RATE_LIMIT_LOGIN_WINDOW_SECONDS', 60, 1, 86_400),
    rateLimitRefreshLimit: readBoundedInteger(source, 'RATE_LIMIT_REFRESH_LIMIT', rateLimitDefaults.refreshLimit, 1, 10_000),
    rateLimitRefreshWindowSeconds: readBoundedInteger(source, 'RATE_LIMIT_REFRESH_WINDOW_SECONDS', 60, 1, 86_400),
    port: readPort(source),
    apiPrefix: readApiPrefix(source),
    logLevel: readEnum(source, 'LOG_LEVEL', LOG_LEVELS, 'info'),
    corsOrigins,
    swaggerEnabled: readBoolean(source, 'SWAGGER_ENABLED', environment !== 'production'),
    databaseUrl: readDatabaseUrl(source, environment),
    redisUrl: readRedisUrl(source, environment),
    jwtAccessSecret: readJwtAccessSecret(source, environment),
    jwtAccessTtlSeconds: readDurationSeconds(source, 'JWT_ACCESS_TTL', '15m', 60, 3_600),
    jwtRefreshTtlSeconds: readDurationSeconds(source, 'JWT_REFRESH_TTL', '30d', 3_600, 7_776_000),
  };
}

export function validateEnvironment(source: EnvironmentSource): Record<string, string> {
  const config = getAppConfiguration(source);
  const validated: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      validated[key] = value;
    }
  }

  return {
    ...Object.fromEntries(Object.entries(validated).filter(([key]) => key !== 'AI_API_KEY')),
    NODE_ENV: config.environment,
    PORT: String(config.port),
    API_PREFIX: config.apiPrefix,
    LOG_LEVEL: config.logLevel,
    CORS_ORIGINS: config.corsOrigins.join(','),
    SWAGGER_ENABLED: String(config.swaggerEnabled),
    ...(config.databaseUrl ? { DATABASE_URL: config.databaseUrl } : {}),
    ...(config.jwtAccessSecret ? { JWT_ACCESS_SECRET: config.jwtAccessSecret } : {}),
    AI_PROVIDER: config.aiProvider,
    AI_MODEL: config.aiModel,
    JWT_ACCESS_TTL: source.JWT_ACCESS_TTL ?? '15m',
    JWT_REFRESH_TTL: source.JWT_REFRESH_TTL ?? '30d',
    RATE_LIMIT_LOGIN_LIMIT: String(config.rateLimitLoginLimit),
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: String(config.rateLimitLoginWindowSeconds),
    RATE_LIMIT_REFRESH_LIMIT: String(config.rateLimitRefreshLimit),
    RATE_LIMIT_REFRESH_WINDOW_SECONDS: String(config.rateLimitRefreshWindowSeconds),
  };
}
