import { z } from 'zod';

/**
 * YouTube links, parsed once for both sides of the wire.
 *
 * A spot keeps a video as its id and an optional start time, never as the URL
 * someone pasted: the id is the only part ever embedded, and a checked
 * 11-character id cannot smuggle anything into an iframe's `src`.
 */

export interface YouTubeVideo {
  /** Always 11 characters of `[A-Za-z0-9_-]`. */
  readonly youtubeId: string;
  /** Seconds into the video to start from, or null for the beginning. */
  readonly startS: number | null;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** `90`, `90s`, `1m30s`, `1h2m3s` — the forms YouTube's own share links use. */
const TIMESTAMP = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;

const MAX_START_S = 24 * 60 * 60;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Path prefixes whose next segment is the video id. */
const ID_PATHS = new Set(['shorts', 'live', 'embed', 'v']);

/**
 * The video a pasted link points at, or null when it is not a link to one
 * YouTube video. A link without `https://` is accepted, as people paste them.
 * An unreadable start time is dropped rather than failing the whole link.
 */
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  const text = input.trim();
  let url: URL;

  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter((segment) => segment !== '');
  const first = segments.at(0);
  let id: string | null = null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = first ?? null;
  } else if (YOUTUBE_HOSTS.has(host) && first !== undefined) {
    if (first === 'watch') {
      id = url.searchParams.get('v');
    } else if (ID_PATHS.has(first)) {
      id = segments.at(1) ?? null;
    }
  }

  if (id === null || !VIDEO_ID.test(id)) {
    return null;
  }

  return {
    youtubeId: id,
    startS: parseStart(url.searchParams.get('t') ?? url.searchParams.get('start')),
  };
}

function parseStart(value: string | null): number | null {
  if (value === null || value.trim() === '') {
    return null;
  }

  const match = TIMESTAMP.exec(value.trim());

  if (!match) {
    return null;
  }

  const seconds =
    Number(match.at(1) ?? 0) * 3600 +
    Number(match.at(2) ?? 0) * 60 +
    Number(match.at(3) ?? 0);

  return seconds > 0 && seconds <= MAX_START_S ? seconds : null;
}

/** A link back to the video on YouTube itself, at its start time. */
export function youTubeWatchUrl(video: YouTubeVideo): string {
  const start = video.startS === null ? '' : `&t=${String(video.startS)}s`;
  return `https://www.youtube.com/watch?v=${video.youtubeId}${start}`;
}

/**
 * The privacy-enhanced player, which sets no cookies until the video plays.
 * Autoplay, because it is only ever loaded after someone pressed play. Null
 * for an id that is not a real one, so a tampered value never reaches an iframe.
 */
export function youTubeEmbedUrl(video: YouTubeVideo): string | null {
  if (!VIDEO_ID.test(video.youtubeId)) {
    return null;
  }

  const params = new URLSearchParams({ autoplay: '1', rel: '0' });

  if (video.startS !== null) {
    params.set('start', String(video.startS));
  }

  return `https://www.youtube-nocookie.com/embed/${video.youtubeId}?${params.toString()}`;
}

/** The stored shape of a video, as the API answers it. */
export const youTubeVideoSchema = z.object({
  youtubeId: z.string(),
  startS: z.number().int().nullable(),
});

/** An already-parsed video, checked as strictly as a link would be. */
const parsedVideoSchema = z.object({
  youtubeId: z.string().regex(VIDEO_ID, 'Paste a link to a YouTube video'),
  startS: z.number().int().min(1).max(MAX_START_S).nullable(),
});

/**
 * A pasted link, `''` or null in; the video it points at, or null, out.
 *
 * It also takes its own output back. The client validates a form with the
 * same create schema the API uses and sends what that produced, so every field
 * must survive a second parse — without this, a form save sent
 * `{ youtubeId, startS }` to an API expecting a link, and failed.
 */
export const youTubeLinkSchema = z
  .union([
    z.string().trim().max(500, 'That link is too long'),
    parsedVideoSchema,
    z.null(),
  ])
  .transform((value, ctx): YouTubeVideo | null => {
    if (value === null || value === '') {
      return null;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const video = parseYouTubeUrl(value);

    if (!video) {
      ctx.addIssue({ code: 'custom', message: 'Paste a link to a YouTube video' });
      return z.NEVER;
    }

    return video;
  });
