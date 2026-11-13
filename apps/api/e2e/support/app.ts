import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';

import { AppModule } from '../../src/app';
import { BlackboxDecoder } from '../../src/flight-logs/abstract/blackbox-decoder';
import { YouTubeThumbnails } from '../../src/youtube';
import { StubBlackboxDecoder } from './stub-blackbox-decoder';
import { StubYouTubeThumbnails } from './stub-youtube-thumbnails';
import { RateSource } from '../../src/exchange-rates';
import { StubRateSource } from './stub-rate-source';
import { CountryLookup } from '../../src/geo';
import { StubCountryLookup } from './stub-country-lookup';

const GLOBAL_PREFIX = 'api';

export interface TestApp {
  readonly app: INestApplication;
  /** What supertest wants: `request(server)`, not the Nest wrapper. */
  readonly server: Server;
  close(): Promise<void>;
}

/**
 * Boots the real `AppModule` — the same one `main.ts` serves — against
 * whatever `DATABASE_URL` and `S3_BUCKET` are already in the environment when
 * this runs. `scripts/run-e2e-tests.mjs` is what points those at the test
 * database and bucket before the suite starts; this file does not know or
 * care that it is being pointed anywhere unusual.
 *
 * Two seams are swapped, both for something outside this repository. Real
 * blackbox logs need Betaflight's native decoder or Docker, neither
 * guaranteed on a test runner, so `BlackboxDecoder` reads already-decoded
 * fixtures instead. And a spot cover would otherwise be fetched from YouTube,
 * so `YouTubeThumbnails` generates its image locally. Exchange rates come
 * from `StubRateSource` rather than the National Bank of Ukraine, and the
 * country of a sign-in from `StubCountryLookup` rather than the database file.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BlackboxDecoder)
    .useClass(StubBlackboxDecoder)
    .overrideProvider(YouTubeThumbnails)
    .useClass(StubYouTubeThumbnails)
    .overrideProvider(RateSource)
    .useClass(StubRateSource)
    .overrideProvider(CountryLookup)
    .useClass(StubCountryLookup)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(cookieParser());
  await app.init();

  return {
    app,
    server: app.getHttpServer() as Server,
    close: () => app.close(),
  };
}
