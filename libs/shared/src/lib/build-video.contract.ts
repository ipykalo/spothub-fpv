import { z } from 'zod';

import { type YouTubeVideo, youTubeLinkSchema } from './youtube';

/** A build holds this many videos at most: a build log, not a channel. */
export const MAX_BUILD_VIDEOS = 20;

/**
 * Adding a video to a build. Only a YouTube link is accepted — any other
 * address is refused here, in the form and in the API alike — and what is
 * stored is the video's id and start time, never the pasted URL.
 */
export const createBuildVideoSchema = z.object({
  link: youTubeLinkSchema.refine((video) => video !== null, {
    message: 'Paste a link to a YouTube video',
  }),
  title: z
    .string()
    .trim()
    .max(80, 'At most 80 characters')
    .transform((title) => (title === '' ? null : title))
    .nullable()
    .default(null),
});

export type BuildVideoFormValue = z.input<typeof createBuildVideoSchema>;
export type CreateBuildVideoDto = z.output<typeof createBuildVideoSchema>;

/** A video on a build, as whoever may open the build reads it. */
export interface BuildVideoDto extends YouTubeVideo {
  readonly id: string;
  readonly buildId: string;
  readonly title: string | null;
  /**
   * The video's thumbnail from our own storage, presigned; null until it has
   * been made, or when YouTube has none. Never a YouTube address.
   */
  readonly coverUrl: string | null;
  readonly createdAt: string;
}
