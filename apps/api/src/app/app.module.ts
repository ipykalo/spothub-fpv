import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { AuthModule } from '../auth';
import { BuildPartsModule } from '../build-parts';
import { BuildsModule } from '../builds';
import { CommentsModule } from '../comments';
import { AllExceptionsFilter, JwtAuthGuard } from '../common';
import { validateEnv } from '../config';
import { ConfigsModule } from '../configs';
import { FlightLogsModule } from '../flight-logs';
import { FlightsModule } from '../flights';
import { HealthModule } from '../health';
import { JobsModule } from '../jobs';
import { MediaModule } from '../media';
import { PartsModule } from '../parts';
import { PrismaModule } from '../prisma';
import { RepairsModule } from '../repairs';
import { SpotsModule } from '../spots';
import { StorageModule } from '../storage';
import { UsersModule } from '../users';

/**
 * Every feature module is listed here even where one arrives transitively —
 * Nest dedupes, and this is the one place the whole graph is legible.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Fails fast at boot rather than surfacing an `undefined` days later.
      validate: validateEnv,
    }),
    PrismaModule,
    StorageModule,
    JobsModule,
    UsersModule,
    AuthModule,
    BuildsModule,
    BuildPartsModule,
    RepairsModule,
    ConfigsModule,
    PartsModule,
    MediaModule,
    FlightsModule,
    FlightLogsModule,
    SpotsModule,
    CommentsModule,
    HealthModule,
  ],
  providers: [
    // Routes are protected by default; opting out is an explicit @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
