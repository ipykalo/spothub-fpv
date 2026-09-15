import type { BuildStatus } from '@spothub/shared';

import type { BuildEntity, CreateBuildData, UpdateBuildData } from '../build.entity';

export interface BuildFilter {
  readonly status?: BuildStatus;
  readonly search?: string;
}

/**
 * Persistence contract for builds.
 *
 * Every method takes the person acting as its first argument. Writes take the
 * owner, so it is impossible to write a query that changes someone else's
 * build. Reads of someone else's build take the viewer instead, and say in
 * their name what they let through: a build shared as Public or Unlisted.
 */
export abstract class BuildsRepository {
  abstract findManyForOwner(ownerId: string, filter: BuildFilter): Promise<BuildEntity[]>;

  abstract findOneForOwner(ownerId: string, id: string): Promise<BuildEntity | null>;

  /**
   * A build the viewer owns, or one shared as Public or Unlisted. A null viewer
   * is a signed-out visitor, who gets only the shared ones.
   */
  abstract findVisibleForViewer(viewerId: string | null, id: string): Promise<BuildEntity | null>;

  /** Every Public build, whoever owns it — the list anyone may browse. */
  abstract findPublic(filter: BuildFilter): Promise<BuildEntity[]>;

  /** The builds among these the viewer may open, by the same rule as one. In no particular order. */
  abstract findManyVisibleForViewer(
    viewerId: string | null,
    ids: readonly string[],
  ): Promise<BuildEntity[]>;

  /** Which of these ids are builds the owner has. */
  abstract findIdsOwnedBy(ownerId: string, ids: readonly string[]): Promise<string[]>;

  /**
   * Other owners' Public builds. Unlisted builds are left out on purpose: they
   * open only for someone given the link.
   */
  abstract findSharedForViewer(viewerId: string, filter: BuildFilter): Promise<BuildEntity[]>;

  abstract slugExistsForOwner(ownerId: string, slug: string): Promise<boolean>;

  abstract create(data: CreateBuildData): Promise<BuildEntity>;

  abstract updateForOwner(
    ownerId: string,
    id: string,
    data: UpdateBuildData,
  ): Promise<BuildEntity | null>;

  abstract deleteForOwner(ownerId: string, id: string): Promise<boolean>;
}
