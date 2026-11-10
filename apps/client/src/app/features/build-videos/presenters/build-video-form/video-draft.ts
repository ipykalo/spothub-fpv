import { type CreateBuildVideoDto, type YouTubeVideo, createBuildVideoSchema } from '@spothub/shared';

/** The add-a-video form, read against the schema the API applies. */
export interface VideoDraft {
  /** What saving sends; null while it cannot be saved. */
  readonly value: CreateBuildVideoDto | null;
  /** Why not, in the contract's words. Null for an empty link: nothing typed is not a mistake. */
  readonly error: string | null;
  /** The video the link points at, so the form can say which one it found. */
  readonly video: YouTubeVideo | null;
}

export function readVideoDraft(link: string, title: string): VideoDraft {
  if (link.trim() === '') {
    return { value: null, error: null, video: null };
  }

  const parsed = createBuildVideoSchema.safeParse({ link, title });

  if (!parsed.success) {
    return {
      value: null,
      error: parsed.error.issues[0]?.message ?? 'Paste a link to a YouTube video',
      video: null,
    };
  }

  return { value: parsed.data, error: null, video: parsed.data.link };
}
