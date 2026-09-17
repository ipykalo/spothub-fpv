import { Injectable } from '@nestjs/common';

import { BlackboxDecoder } from '../../abstract/blackbox-decoder';
import { type LogReadContext, LogReader } from '../../abstract/log-reader';
import type { Fix } from '../gps-track';
import { LogParseError, type ParsedLog } from '../parsed-log';
import { blackboxOrigin, craftNameFrom, parseBlackboxLogs } from './blackbox-csv.parser';

/**
 * A Betaflight blackbox log: binary, decoded by Betaflight's own decoder and
 * read from the CSV it writes. It records no date, so it is placed on the day
 * the batch says it was flown — and refused without one.
 */
@Injectable()
export class BlackboxReader extends LogReader {
  readonly contentType = 'application/octet-stream';
  readonly extension = '.bbl';

  constructor(private readonly decoder: BlackboxDecoder) {
    super();
  }

  async read(body: Buffer, context: LogReadContext): Promise<ParsedLog> {
    if (context.flownOn === null) {
      throw new LogParseError(
        'Pick the day these blackbox logs were flown, then import them again',
      );
    }

    return parseBlackboxLogs(
      await this.decoder.decode(body),
      craftNameFrom(body),
      blackboxOrigin(context.flownOn, context.fileName),
    );
  }

  /**
   * None: a blackbox log records no time of day, so even where the quad had
   * GPS its fixes could not be placed against a flight's clock. A track for
   * one of these flights comes from a GPX that joined it.
   */
  fixes(): Promise<readonly Fix[]> {
    return Promise.resolve([]);
  }
}
