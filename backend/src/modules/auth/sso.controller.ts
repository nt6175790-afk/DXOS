// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, Header, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { SsoService } from './sso.service';
import { AuthRateLimitGuard, UseAuthRateLimit } from './auth-rate-limit.guard';
import { AUTH_RATE_LIMIT_SCOPES } from './auth-rate-limit.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

export class SsoCompleteDto {
  @IsString() @Length(1, 4096) code!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) state!: string;
  @IsString() @Length(40, 4096) @Matches(/^[A-Za-z0-9_-]+$/) challenge!: string;
  @IsOptional() @IsString() @Length(1, 191) iss?: string;
}

@Controller('auth/sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}
  @Get('config') @Header('Cache-Control', 'no-store')
  info() { return this.sso.info(); }

  @Get('logout-url') @Header('Cache-Control', 'no-store') @UseGuards(JwtAuthGuard)
  logoutUrl() { return this.sso.logoutUrl(); }

  @Post('start') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @UseGuards(AuthRateLimitGuard) @UseAuthRateLimit(AUTH_RATE_LIMIT_SCOPES.LOGIN)
  start(@Headers('origin') origin?: string) { this.sso.assertOrigin(origin); return this.sso.start(); }

  @Post('complete') @HttpCode(200) @Header('Cache-Control', 'no-store')
  @UseGuards(AuthRateLimitGuard) @UseAuthRateLimit(AUTH_RATE_LIMIT_SCOPES.LOGIN)
  complete(@Body() body: SsoCompleteDto, @Headers('origin') origin?: string) {
    this.sso.assertOrigin(origin); return this.sso.complete(body);
  }
}
