import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import {
  AuthService,
  PasswordService,
  RefreshTokenService,
  TokenService
} from './auth.service';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TokenService,
    RefreshTokenService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard }
  ],
  exports: [AuthService, PasswordService, TokenService, RefreshTokenService]
})
export class AuthModule {}
