// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Module } from '@nestjs/common';
import { AuditWriterModule } from '../audit/audit-writer.module';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordService } from './password.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthRateLimitStore } from './auth-rate-limit.store';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';
import { OidcProvider } from './oidc.provider';

@Module({
  imports: [AuditWriterModule],
  controllers: [AuthController, SsoController],
  providers: [SsoService, OidcProvider, AccessTokenService, AuthService, JwtAuthGuard, PasswordService, AuthRateLimitStore, AuthRateLimitService, AuthRateLimitGuard],
  exports: [AccessTokenService, AuthService, JwtAuthGuard, PasswordService, AuthRateLimitService, AuthRateLimitGuard],
})
export class AuthModule {}
