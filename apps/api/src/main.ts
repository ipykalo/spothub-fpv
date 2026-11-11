import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app';
import type { Env } from './config';

const GLOBAL_PREFIX = 'api';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService<Env, true>);

  // Behind Caddy, the visitor's address is the last one Caddy appended to
  // X-Forwarded-For. Caddy replaces whatever the visitor sent, so trusting
  // exactly its hop cannot be spoofed; trusting more could.
  const hops = config.get('TRUST_PROXY_HOPS', { infer: true });
  app.set('trust proxy', hops === 0 ? false : hops);

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(helmet());
  app.use(cookieParser());

  // Credentials must be allowed for the refresh cookie to survive the
  // cross-origin call from the dev client on :4200.
  app.enableCors({
    origin: config.get('CLIENT_URL', { infer: true }),
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}/${GLOBAL_PREFIX}`, 'Bootstrap');
}

void bootstrap();
