import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { GeoModule } from '../geo';
import { SettingsModule } from '../settings';
import { UsersModule } from '../users';
import { RefreshTokenRepository } from './abstract/refresh-token.repository';
import { AuthController } from './auth.controller';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Sign-in: admission, account linking, token issuing and rotation.
 *
 * It reaches users through `UsersFacade`, and asks `SettingsFacade` who may
 * sign in. The request-pipeline
 * pieces it used to own — `JwtAuthGuard`, `@Public()`, `@CurrentUser()` — live
 * in `common/` now, which is why nothing outside `app.module.ts` imports this
 * module's barrel.
 */
@Module({
  imports: [
    UsersModule,
    SettingsModule,
    GeoModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    GoogleStrategy,
    JwtStrategy,
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
  ],
})
export class AuthModule {}
