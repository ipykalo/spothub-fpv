/**
 * Turns a Betaflight blackbox file into the decoder's CSV.
 *
 * A port, like storage: the decoder is a native program the API runs, and the
 * worker should not care whether it runs directly or through Docker.
 */
export abstract class BlackboxDecoder {
  /**
   * Every log in the file, in the order it was recorded, as CSV with frame
   * times in seconds. Throws `LogParseError` when the bytes are not a blackbox
   * log the decoder can read.
   */
  abstract decode(bytes: Buffer): Promise<string[]>;
}
