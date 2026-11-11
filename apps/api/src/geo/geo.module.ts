import { Module } from '@nestjs/common';

import { CountryLookup } from './abstract/country-lookup';
import { MmdbCountryLookup } from './mmdb-country-lookup';

/**
 * Infrastructure, like `storage`: which country an IP address is in, for
 * `auth` to refuse sign-ins from restricted countries. `CountryLookup` is the
 * only provider exported, and the e2e suite swaps it for a stub.
 */
@Module({
  providers: [{ provide: CountryLookup, useClass: MmdbCountryLookup }],
  exports: [CountryLookup],
})
export class GeoModule {}
