/**
 * Where a YouTube video's thumbnail image comes from.
 *
 * A port, so the domain never makes an HTTP call itself, and so the e2e suite
 * can stand in for YouTube: a test must not depend on a third party being up,
 * or on somebody's video continuing to exist.
 */
export abstract class YouTubeThumbnails {
  /**
   * The largest thumbnail YouTube has for the video, as the bytes it sent, or
   * null when it has none (a removed or private video). Throws when YouTube
   * could not be asked, so the job retries rather than giving up on a cover.
   */
  abstract fetch(youtubeId: string): Promise<Buffer | null>;
}
