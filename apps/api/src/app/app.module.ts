import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuildsModule } from '../builds/builds.module';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { validateEnv } from '../config/env.schema';
import { HealthModule } from '../health/health.module';
import { PartsModule } from '../parts/parts.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Fails fast at boot rather than surfacing an `undefined` days later.
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    BuildsModule,
    PartsModule,
    HealthModule,
  ],
  providers: [
    // Routes are protected by default; opting out is an explicit @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
