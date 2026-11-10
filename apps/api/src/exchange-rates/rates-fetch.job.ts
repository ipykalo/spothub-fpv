import { Injectable, type OnModuleInit } from '@nestjs/common';

import { JobQueue } from '../jobs';
import { ExchangeRatesRepository } from './abstract/exchange-rates.repository';
import { RateSource } from './abstract/rate-source';

export const RATES_FETCH_JOB = 'rates.fetch';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fetches one day's official rates and keeps them. Queued the first time a
 * price dated that day is converted; a day already stored is not fetched
 * again, and a bank that cannot be reached is tried again with backoff.
 */
@Injectable()
export class RatesFetchJob implements OnModuleInit {
  constructor(
    private readonly jobs: JobQueue,
    private readonly rates: ExchangeRatesRepository,
    private readonly source: RateSource,
  ) {}

  onModuleInit(): void {
    this.jobs.register(RATES_FETCH_JOB, (payload) => this.run(payload));
  }

  async run(payload: Readonly<Record<string, unknown>>): Promise<void> {
    const day = payload['day'];

    // A malformed job is not worth a retry: there is nothing to fetch.
    if (typeof day !== 'string' || !DAY.test(day)) {
      return;
    }

    if ((await this.rates.storedDays([day])).has(day)) {
      return;
    }

    await this.rates.saveDay(day, await this.source.ratesFor(day));
  }
}
