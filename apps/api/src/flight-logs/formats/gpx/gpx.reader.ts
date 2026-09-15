import { Injectable } from '@nestjs/common';

import { LogReader } from '../../abstract/log-reader';
import type { ParsedLog } from '../parsed-log';
import { parseGpx } from './gpx.parser';

/**
 * A GPX track from any GPS: read as text. Its times are true UTC, so it needs
 * no day from the import, and its tracks join the flights they overlap.
 */
@Injectable()
export class GpxReader extends LogReader {
  readonly contentType = 'application/gpx+xml';
  readonly extension = '.gpx';

  read(body: Buffer): Promise<ParsedLog> {
    return Promise.resolve(parseGpx(body.toString('utf8')));
  }
}
