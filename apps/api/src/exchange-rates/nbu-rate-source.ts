import { Injectable } from '@nestjs/common';
import { isCurrency } from '@spothub/shared';

import { RateSource } from './abstract/rate-source';

/**
 * The National Bank of Ukraine's official rates: one request gives every
 * currency it publishes for a day, as hryvnias per unit. Free, with no key
 * and no account; all that is sent is the date.
 */
const NBU_RATES = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangenew';
const TIMEOUT_MS = 10_000;

interface NbuRate {
  readonly cc?: unknown;
  readonly rate?: unknown;
}

@Injectable()
export class NbuRateSource extends RateSource {
  async ratesFor(day: string): Promise<ReadonlyMap<string, number>> {
    const url = `${NBU_RATES}?json&date=${day.replaceAll('-', '')}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`The NBU answered ${String(response.status)} for ${day}`);
    }

    const body: unknown = await response.json();
    const rates = new Map<string, number>();

    for (const entry of Array.isArray(body) ? (body as NbuRate[]) : []) {
      // Only currencies a price may be in: the NBU also lists gold, silver and SDRs.
      if (
        typeof entry.cc === 'string' &&
        isCurrency(entry.cc) &&
        typeof entry.rate === 'number' &&
        Number.isFinite(entry.rate) &&
        entry.rate > 0
      ) {
        rates.set(entry.cc.toUpperCase(), entry.rate);
      }
    }

    if (rates.size === 0) {
      throw new Error(`The NBU gave no rates for ${day}`);
    }

    return rates;
  }
}
