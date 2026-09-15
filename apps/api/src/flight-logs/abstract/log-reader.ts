import type { ParsedLog } from '../formats/parsed-log';

/** What a reader is told about a file beyond its bytes. */
export interface LogReadContext {
  /** As the radio or the flight controller named it. */
  readonly fileName: string;
  /** The day the batch says its logs were flown, as YYYY-MM-DD; null when not given. */
  readonly flownOn: string | null;
}

/**
 * One log format: what it is uploaded as, and how it becomes flights.
 *
 * A strategy per format, picked by `LogReaders` from the format a file was
 * reserved as, so neither the upload nor the import job branches on format.
 * A new format is a reader under `formats/` and one entry in `LogReaders`.
 */
export abstract class LogReader {
  /** What the upload is signed and stored as — part of the presigned PUT's signature. */
  abstract readonly contentType: string;

  /** What a stored log's key ends in. */
  abstract readonly extension: string;

  /** Throws `LogParseError` when the file cannot be read into flights as it stands. */
  abstract read(body: Buffer, context: LogReadContext): Promise<ParsedLog>;
}
