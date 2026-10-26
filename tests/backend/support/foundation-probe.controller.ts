// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsEmail } from 'class-validator';

class ValidationProbeDto {
  @IsEmail()
  email!: string;
}

@Controller('__test')
export class FoundationProbeController {
  @Post('validation')
  validate(@Body() body: ValidationProbeDto): ValidationProbeDto {
    return body;
  }

  @Get('error')
  error(): never {
    throw new Error('password=super-secret-test-value');
  }

  @Get('database-conflict')
  databaseConflict(): never {
    throw new Prisma.PrismaClientKnownRequestError('SQL-sensitive-detail', {
      code: 'P2002',
      clientVersion: 'test',
    });
  }
}
