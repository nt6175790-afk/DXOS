// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../backend/src/modules/ai/ai.service';
import { OpenAiProvider } from '../../backend/src/modules/ai/openai-ai.provider';
import type { AppConfiguration } from '../../backend/src/config/environment';
import { ApiErrorException } from '../../backend/src/common/errors/api-error.exception';

describe('Unconfigured AI Provider Handling (DXOS-PHASE3-TASK1)', () => {
  it('returns isConfigured: false in getConfig when API key is absent', async () => {
    const app = {
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
      aiApiKey: undefined,
      aiTimeoutMs: 5000,
    } as AppConfiguration;
    const config = new ConfigService({ app });
    const aiData = { buildContextSummary: jest.fn() };
    const service = new AiService(null as unknown as ConstructorParameters<typeof AiService>[0], null as unknown as ConstructorParameters<typeof AiService>[1], null as unknown as ConstructorParameters<typeof AiService>[2], null as unknown as ConstructorParameters<typeof AiService>[3], config, aiData as unknown as ConstructorParameters<typeof AiService>[5]);

    const result = await service.getConfig('org-1');
    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      isConfigured: false,
    });
  });

  it('fails with 503 and clear Vietnamese message when generating with unconfigured provider', async () => {
    const app = {
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini',
      aiApiKey: undefined,
      aiTimeoutMs: 5000,
    } as AppConfiguration;
    const config = new ConfigService({ app });
    const provider = new OpenAiProvider(config);
    const mockPrisma = {
      $transaction: jest.fn(async (callback) => {
        return callback({
          aiRequest: {
            create: jest.fn().mockResolvedValue({ id: 'ai-req-1' }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        });
      }),
    };
    const mockAuthz = {
      can: jest.fn().mockResolvedValue(true),
      effectivePermissions: jest.fn().mockResolvedValue(['ai:use']),
    };
    const mockAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const mockAiData = {
      buildContextSummary: jest.fn().mockResolvedValue('Organization context'),
    };

    const service = new AiService(mockPrisma as unknown as ConstructorParameters<typeof AiService>[0], mockAuthz as unknown as ConstructorParameters<typeof AiService>[1], mockAudit as unknown as ConstructorParameters<typeof AiService>[2], provider as unknown as ConstructorParameters<typeof AiService>[3], config, mockAiData as unknown as ConstructorParameters<typeof AiService>[5]);

    await expect(
      service.generate('usr-1', 'org-1', {
        messages: [{ role: 'user', content: 'Xin chào' }],
        maxOutputTokens: 64,
        temperature: 0,
      })
    ).rejects.toThrow(ApiErrorException);

    try {
      await service.generate('usr-1', 'org-1', {
        messages: [{ role: 'user', content: 'Xin chào' }],
        maxOutputTokens: 64,
        temperature: 0,
      });
    } catch (err: unknown) {
      if (!(err instanceof ApiErrorException)) throw err;
      expect(err.getStatus()).toBe(503);
      expect(err.getResponse()).toBe('AI Provider chưa được cấu hình.');
    }
  });
});
