import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from '../auth';
import { BlocksModule } from '../blocks';
import { BuildPartsModule } from '../build-parts';
import { BuildsModule } from '../builds';
import { CommentsModule } from '../comments';
import { AllExceptionsFilter, JwtAuthGuard, rateLimits, RateLimitGuard } from '../common';
import { validateEnv } from '../config';
import { ConfigsModule } from '../configs';
import { FlightLogsModule } from '../flight-logs';
import { FlightsModule } from '../flights';
import { HealthModule } from '../health';
import { JobsModule } from '../jobs';
import { LikesModule } from '../likes';
import { ReportsModule } from '../reports';
import { MediaModule } from '../media';
import { PartsModule } from '../parts';
import { PostsModule } from '../posts';
import { PrismaModule } from '../prisma';
import { RepairsModule } from '../repairs';
import { BuildVideosModule } from '../build-videos';
import { ExchangeRatesModule } from '../exchange-rates';
import { SettingsModule } from '../settings';
import { SpotsModule } from '../spots';
import { StorageModule } from '../storage';
import { UsersModule } from '../users';
import { YouTubeModule } from '../youtube';

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
    // Counted in memory: one API process, and a restart forgetting the
    // counts costs nothing worth a Redis.
    ThrottlerModule.forRootAsync({ inject: [ConfigService], useFactory: rateLimits }),
    PrismaModule,
    StorageModule,
    YouTubeModule,
    JobsModule,
    UsersModule,
    AuthModule,
    BuildsModule,
    BuildPartsModule,
    RepairsModule,
    BuildVideosModule,
    ExchangeRatesModule,
    ConfigsModule,
    PartsModule,
    MediaModule,
    FlightsModule,
    FlightLogsModule,
    SpotsModule,
    CommentsModule,
    PostsModule,
    LikesModule,
    BlocksModule,
    ReportsModule,
    SettingsModule,
    HealthModule,
  ],
  providers: [
    // Routes are protected by default; opting out is an explicit @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // After authentication, so a signed-in pilot is counted as themselves.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
