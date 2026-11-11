import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isCurrency } from '@spothub/shared';

import type { Env } from '../config';
import { RateSource } from './abstract/rate-source';

interface NbuRate {
  readonly cc?: unknown;
  readonly rate?: unknown;
}

/**
 * The National Bank of Ukraine's official rates: one request gives every
 * currency it publishes for a day, as hryvnias per unit. Free, with no key
 * and no account; all that is sent is the date. Where it is asked and how
 * long it is waited for are `NBU_RATES_URL` and `NBU_RATES_TIMEOUT_MS`.
 */
@Injectable()
export class NbuRateSource extends RateSource {
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.url = config.get('NBU_RATES_URL', { infer: true });
    this.timeoutMs = config.get('NBU_RATES_TIMEOUT_MS', { infer: true });
  }

  async ratesFor(day: string): Promise<ReadonlyMap<string, number>> {
    const response = await fetch(`${this.url}?json&date=${day.replaceAll('-', '')}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
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
