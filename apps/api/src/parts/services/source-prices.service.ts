import { Injectable } from '@nestjs/common';
import { type PartDto, totalCurrencies } from '@spothub/shared';

import { ExchangeRatesFacade } from '../../exchange-rates';

/**
 * Every source price of a list of parts in the viewer's own currency and USD,
 * each at the rate of the day it was paid — what lets a price read
 * "paid · ≈ home · ≈ USD" wherever a part is shown.
 *
 * One rate lookup for the whole list. Converted here rather than in the
 * mapper, because the mapper does not know whose currency to convert into.
 */
@Injectable()
export class SourcePrices {
  constructor(private readonly rates: ExchangeRatesFacade) {}

  async convert(parts: readonly PartDto[], homeCurrency: string): Promise<PartDto[]> {
    const priced = parts.flatMap((part) =>
      part.sources.flatMap((source) =>
        source.price === null || source.currency === null
          ? []
          : [
              {
                id: source.id,
                amount: source.price,
                currency: source.currency,
                day: (source.purchasedOn ?? source.capturedAt).slice(0, 10),
              },
            ],
      ),
    );

    if (priced.length === 0) {
      return [...parts];
    }

    const converted = await this.rates.each(priced, totalCurrencies(homeCurrency));
    const byId = new Map(priced.map((entry, index) => [entry.id, converted[index]]));

    return parts.map((part) => ({
      ...part,
      sources: part.sources.map((source) => ({
        ...source,
        converted: byId.get(source.id) ?? [],
      })),
    }));
  }
}
