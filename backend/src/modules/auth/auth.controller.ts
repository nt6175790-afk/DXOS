// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from './auth.types';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { CurrentUserDto } from './dto/current-user.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthRateLimitGuard, UseAuthRateLimit } from './auth-rate-limit.guard';
import { AUTH_RATE_LIMIT_SCOPES } from './auth-rate-limit.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @UseAuthRateLimit(AUTH_RATE_LIMIT_SCOPES.LOGIN)
  login(@Body() login: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(login);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @UseAuthRateLimit(AUTH_RATE_LIMIT_SCOPES.REFRESH)
  refresh(@Body() body: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() currentUser: AuthenticatedRequestContext): CurrentUserDto {
    return currentUser.user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() currentUser: AuthenticatedRequestContext): Promise<void> {
    await this.authService.logout(currentUser.user.id, currentUser.sessionId);
  }
}
