import { Injectable } from '@nestjs/common';

import { RateSource } from '../../src/exchange-rates';

/**
 * Stands in for the National Bank of Ukraine, so no test calls a bank. Its
 * rates are made up but shaped like the real ones — hryvnias per unit — and
 * they rise by a hryvnia a day from 2026-01-01, so a test can tell which
 * day's rate a price was converted at. It remembers which days it was asked.
 */
@Injectable()
export class StubRateSource extends RateSource {
  static readonly asked: string[] = [];

  /** On 2026-01-01 a dollar is 40 hryvnias, a euro 45, a złoty 10. */
  static usdOn(day: string): number {
    return 40 + StubRateSource.daysSince2026(day);
  }

  private static daysSince2026(day: string): number {
    return Math.round((Date.parse(day) - Date.parse('2026-01-01')) / 86_400_000);
  }

  ratesFor(day: string): Promise<ReadonlyMap<string, number>> {
    StubRateSource.asked.push(day);
    const shift = StubRateSource.daysSince2026(day);

    return Promise.resolve(
      new Map([
        ['USD', 40 + shift],
        ['EUR', 45 + shift],
        ['PLN', 10],
      ]),
    );
  }
}
