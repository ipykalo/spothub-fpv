import { Injectable, Logger } from '@nestjs/common';

import { JobQueue } from '../jobs';
import { ExchangeRatesFacade } from './abstract/exchange-rates.facade';
import { ExchangeRatesRepository } from './abstract/exchange-rates.repository';
import {
  type ConvertedTotal,
  type DatedAmount,
  type RatesByDay,
  convertEach,
  convertTotal,
  daysNeeded,
} from './conversion';
import { RATES_FETCH_JOB } from './rates-fetch.job';

/** How long a day asked for stays asked for, so a busy page does not queue it again. */
const ASKED_FOR_MS = 10 * 60_000;

@Injectable()
export class ExchangeRatesFacadeImpl extends ExchangeRatesFacade {
  private readonly logger = new Logger(ExchangeRatesFacadeImpl.name);
  /** Days already queued, with when — an in-memory brake, not a guarantee. */
  private readonly askedFor = new Map<string, number>();

  constructor(
    private readonly rates: ExchangeRatesRepository,
    private readonly jobs: JobQueue,
  ) {
    super();
  }

  async totals(
    amounts: readonly DatedAmount[],
    currencies: readonly string[],
  ): Promise<ConvertedTotal[]> {
    const rates = await this.ratesFor(amounts, currencies);
    return currencies.map((currency) => convertTotal(amounts, currency, rates));
  }

  async each(
    amounts: readonly DatedAmount[],
    currencies: readonly string[],
  ): Promise<ConvertedTotal[][]> {
    if (amounts.length === 0) {
      return [];
    }

    return convertEach(amounts, currencies, await this.ratesFor(amounts, currencies));
  }

  /** The stored rates the conversion needs, queuing any day not stored yet. */
  private async ratesFor(
    amounts: readonly DatedAmount[],
    currencies: readonly string[],
  ): Promise<RatesByDay> {
    const days = daysNeeded(amounts, currencies);
    const [rates, stored] = await Promise.all([
      this.rates.ratesAround(days),
      this.rates.storedDays(days),
    ]);

    await this.askFor(days.filter((day) => !stored.has(day)));

    return rates;
  }

  /** Queues the days not stored yet. A failure to queue never fails the page. */
  private async askFor(days: readonly string[]): Promise<void> {
    const now = Date.now();

    for (const day of days) {
      const asked = this.askedFor.get(day);

      if (asked !== undefined && now - asked < ASKED_FOR_MS) {
        continue;
      }

      this.askedFor.set(day, now);

      try {
        await this.jobs.enqueue(RATES_FETCH_JOB, { day });
      } catch (error) {
        this.logger.warn(`Could not queue the rates for ${day}: ${String(error)}`);
      }
    }
  }
}
