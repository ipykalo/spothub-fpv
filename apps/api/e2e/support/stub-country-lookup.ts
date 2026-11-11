import { Injectable } from '@nestjs/common';

import { CountryLookup } from '../../src/geo';

/**
 * Stands in for the IP-to-country database, so no test needs the downloaded
 * file. A few documentation addresses (RFC 5737, never routed) are placed in
 * named countries; every other address is unplaced, as loopback is.
 */
@Injectable()
export class StubCountryLookup extends CountryLookup {
  static readonly PLACES: Readonly<Record<string, string>> = {
    '198.51.100.7': 'RU',
    '198.51.100.8': 'UA',
    '198.51.100.9': 'IR',
  };

  countryOf(ip: string | undefined): string | null {
    return ip === undefined ? null : (StubCountryLookup.PLACES[ip] ?? null);
  }
}
