import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module';
import { AllowlistService } from './allowlist.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { RefreshTokenRepository } from './refresh-token.repository';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AllowlistService,
    GoogleStrategy,
    JwtStrategy,
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
  ],
  exports: [AuthService],
})
export class AuthModule {}
