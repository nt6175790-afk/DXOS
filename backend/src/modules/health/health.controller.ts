// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Controller, Get } from '@nestjs/common';
import { HealthResponseDto } from './dto/health-response.dto';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'dx-os-api',
      timestamp: new Date().toISOString(),
    };
  }
}
