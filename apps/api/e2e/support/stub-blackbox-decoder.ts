import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { Injectable } from '@nestjs/common';

// Reaches past the flight-logs module's barrel on purpose: BlackboxDecoder is
// an infrastructure seam meant to be swapped in a test harness, not part of
// the module's public API (its index.ts stays "nothing but the module class").
import { BlackboxDecoder } from '../../src/flight-logs/abstract/blackbox-decoder';

const FIXTURES = join(__dirname, '../../src/flight-logs/formats/blackbox/__fixtures__');
const DECODED = join(FIXTURES, 'decoded');

/** One `.bbl` fixture and the decoded CSVs `blackbox_decode` gave for it. */
interface Registration {
  readonly bblPath: string;
  readonly decodedNames: readonly string[];
}

const REGISTRATIONS: readonly Registration[] = [
  {
    bblPath: join(FIXTURES, 'cinelog20', 'btfl_001.bbl'),
    decodedNames: ['cinelog20-btfl_001.01.csv.gz'],
  },
  {
    bblPath: join(FIXTURES, 'air65', 'btfl_007.bbl'),
    decodedNames: ['air65-btfl_007.01.csv.gz', 'air65-btfl_007.02.csv.gz'],
  },
];

/**
 * Stands in for `ProcessBlackboxDecoder` in e2e tests, so they need neither
 * the native binary nor the Docker image.
 *
 * Keyed by the checksum of the uploaded bytes against the two real `.bbl`
 * fixtures the unit tests already pin, so an e2e test gets back the same
 * genuinely-decoded CSV those tests check figures against — never anything
 * invented for the occasion.
 */
@Injectable()
export class StubBlackboxDecoder extends BlackboxDecoder {
  private readonly byChecksum = new Map<string, readonly string[]>();

  constructor() {
    super();

    for (const { bblPath, decodedNames } of REGISTRATIONS) {
      const bytes = readFileSync(bblPath);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      const decoded = decodedNames.map((name) =>
        gunzipSync(readFileSync(join(DECODED, name))).toString('utf8'),
      );

      this.byChecksum.set(checksum, decoded);
    }
  }

  decode(bytes: Buffer): Promise<string[]> {
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const decoded = this.byChecksum.get(checksum);

    if (!decoded) {
      throw new Error(
        'StubBlackboxDecoder has no fixture for this file — register it in stub-blackbox-decoder.ts',
      );
    }

    return Promise.resolve([...decoded]);
  }
}
