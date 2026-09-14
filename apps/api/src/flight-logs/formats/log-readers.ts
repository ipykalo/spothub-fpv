import { Injectable } from '@nestjs/common';
import { LogFormat } from '@spothub/shared';

import type { LogReader } from '../abstract/log-reader';
import { BlackboxReader } from './blackbox/blackbox.reader';
import { EdgeTxReader } from './edgetx/edgetx.reader';

/**
 * Every log format the import understands, keyed by `LogFormat`.
 *
 * A record rather than a list, so a format added to the shared enum without a
 * reader is a compile error here — not a file that fails once it is uploaded.
 */
@Injectable()
export class LogReaders {
  private readonly byFormat: Readonly<Record<LogFormat, LogReader>>;

  constructor(edgetx: EdgeTxReader, blackbox: BlackboxReader) {
    this.byFormat = {
      [LogFormat.EdgetxCsv]: edgetx,
      [LogFormat.BetaflightBbl]: blackbox,
    };
  }

  for(format: LogFormat): LogReader {
    return this.byFormat[format];
  }
}
