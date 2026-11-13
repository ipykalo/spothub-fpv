import type {
  BuildVideoEntity,
  CoverlessVideo,
  CreateBuildVideoData,
} from '../build-video.entity';

/**
 * Persistence contract for a build's videos.
 *
 * `ownerId` comes first on every write, as everywhere else. Videos are reached
 * through their build, so ownership is checked against the parent.
 */
export abstract class BuildVideosRepository {
  /**
   * The build's owner, when the viewer may open the build — their own, or one
   * shared as Public or Unlisted. Null otherwise.
   */
  abstract findBuildOwnerVisibleToViewer(
    viewerId: string,
    buildId: string,
  ): Promise<string | null>;

  /** Newest first. */
  abstract findManyForOwner(
    ownerId: string,
    buildId: string,
  ): Promise<BuildVideoEntity[]>;

  abstract findOneForOwner(
    ownerId: string,
    videoId: string,
  ): Promise<BuildVideoEntity | null>;

  /**
   * Adds a video to the owner's build. Null when the build is not theirs;
   * `'full'` when it already holds `limit` videos.
   */
  abstract create(
    ownerId: string,
    data: CreateBuildVideoData,
    limit: number,
  ): Promise<BuildVideoEntity | 'full' | null>;

  /**
   * Records the cover made for a video — only while the video is still there
   * and has none, so a cover made twice, or for a video deleted meanwhile, is
   * refused and its maker deletes it. False when refused.
   */
  abstract setCoverForOwner(
    ownerId: string,
    videoId: string,
    coverStorageKey: string,
  ): Promise<boolean>;

  /** The deleted video, for its cover to go with it; null when there was none. */
  abstract deleteForOwner(
    ownerId: string,
    buildId: string,
    videoId: string,
  ): Promise<BuildVideoEntity | null>;

  /** Videos with no cover yet, by id after `after`, for the backfill to page through. */
  abstract findCoverless(after: string | null, limit: number): Promise<CoverlessVideo[]>;
}
