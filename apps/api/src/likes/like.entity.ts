/** What a like is for: a post or a build. */
export const LikeSubject = {
  Post: 'post',
  Build: 'build',
} as const;
export type LikeSubject = (typeof LikeSubject)[keyof typeof LikeSubject];

/** One subject a like can be for. */
export interface LikeRef {
  readonly subject: LikeSubject;
  readonly subjectId: string;
}

/** Like counts per subject id, and whether the viewer is among them. */
export interface LikeTally {
  readonly count: number;
  readonly likedByViewer: boolean;
}
