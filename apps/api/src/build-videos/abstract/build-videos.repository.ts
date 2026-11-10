import type { BuildVideoEntity, CreateBuildVideoData } from '../build-video.entity';

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
  abstract findManyForOwner(ownerId: string, buildId: string): Promise<BuildVideoEntity[]>;

  /**
   * Adds a video to the owner's build. Null when the build is not theirs;
   * `'full'` when it already holds `limit` videos.
   */
  abstract create(
    ownerId: string,
    data: CreateBuildVideoData,
    limit: number,
  ): Promise<BuildVideoEntity | 'full' | null>;

  abstract deleteForOwner(ownerId: string, buildId: string, videoId: string): Promise<boolean>;
}
