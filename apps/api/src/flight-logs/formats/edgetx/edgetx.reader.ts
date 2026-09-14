import { Injectable } from '@nestjs/common';

import { type LogReadContext, LogReader } from '../../abstract/log-reader';
import type { ParsedLog } from '../parsed-log';
import { parseEdgeTxCsv } from './edgetx-csv.parser';

/** The radio's EdgeTX telemetry log: a CSV, read as text. */
@Injectable()
export class EdgeTxReader extends LogReader {
  readonly contentType = 'text/csv';
  readonly extension = '.csv';

  read(body: Buffer, context: LogReadContext): Promise<ParsedLog> {
    return Promise.resolve(parseEdgeTxCsv(body.toString('utf8'), context.fileName));
  }
}
