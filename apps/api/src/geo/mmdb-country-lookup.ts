import { readFileSync } from 'node:fs';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CountryResponse, Reader } from 'mmdb-lib';

import type { Env } from '../config';
import { CountryLookup } from './abstract/country-lookup';

/**
 * Reads DB-IP's "IP to Country Lite" file (`GEOIP_COUNTRY_DB`), which the API
 * image downloads when it is built (`npm run geo:download` in development).
 * Loaded once, at start-up, into memory: a few megabytes, and every lookup
 * after that is local.
 *
 * Without the file every address is unplaced, so nobody is refused for their
 * country — said once in the log, not on every sign-in.
 */
@Injectable()
export class MmdbCountryLookup extends CountryLookup implements OnModuleInit {
  private readonly logger = new Logger(MmdbCountryLookup.name);
  private readonly path: string;
  private reader: Reader<CountryResponse> | null = null;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.path = config.get('GEOIP_COUNTRY_DB', { infer: true });
  }

  onModuleInit(): void {
    try {
      this.reader = new Reader<CountryResponse>(readFileSync(this.path));
    } catch (error) {
      this.logger.warn(
        `No country database at ${this.path} (${String(error)}): sign-ins are not checked by country. Run npm run geo:download.`,
      );
    }
  }

  countryOf(ip: string | undefined): string | null {
    if (!ip || this.reader === null) {
      return null;
    }

    // IPv4 as Node reports it on an IPv6 socket: ::ffff:46.224.2.250.
    const address = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;

    try {
      return this.reader.get(address)?.country?.iso_code.toUpperCase() ?? null;
    } catch {
      return null;
    }
  }
}
