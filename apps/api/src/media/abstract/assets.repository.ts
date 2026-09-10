import type {
  AssetEntity,
  AssetSubject,
  CommitAssetData,
  CreateAssetData,
} from '../asset.entity';

/**
 * Persistence contract for media.
 *
 * `ownerId` comes first on every method, as everywhere else. Assets carry
 * their own `owner_id`, so the check is direct rather than through a parent —
 * but attaching one to a subject still verifies the *subject* belongs to the
 * same owner, which is a join inside this repository rather than a call into
 * the builds module. That is what keeps this module dependency-free, so
 * `builds` can depend on it without closing a cycle.
 */
export abstract class AssetsRepository {
  abstract create(data: CreateAssetData): Promise<AssetEntity>;

  abstract findOneForOwner(ownerId: string, id: string): Promise<AssetEntity | null>;

  /**
   * Marks an upload processed, recording what reading the bytes revealed and
   * creating the thumbnail row alongside it.
   */
  abstract commitForOwner(
    ownerId: string,
    id: string,
    data: CommitAssetData,
  ): Promise<AssetEntity | null>;

  abstract markFailedForOwner(ownerId: string, id: string): Promise<void>;

  /** True when the subject row exists and belongs to this owner. */
  abstract subjectBelongsToOwner(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<boolean>;

  /** Appends to the end of the subject's gallery. Idempotent. */
  abstract linkForOwner(
    ownerId: string,
    assetId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<boolean>;

  abstract findManyForSubject(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<AssetEntity[]>;

  /**
   * Removes the asset and its thumbnail, and answers with the storage keys so
   * the caller can delete the objects the rows were pointing at.
   */
  abstract deleteForOwner(ownerId: string, assetId: string): Promise<readonly string[]>;

  /** Writes the given order. Ids not on this subject are ignored. */
  abstract reorderForSubject(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
    assetIds: readonly string[],
  ): Promise<void>;

  /**
   * Sets or clears a build's cover.
   *
   * Lives here because it writes `builds.cover_asset_id` while the constraint
   * that matters — the asset must be one of that build's photos — is an
   * asset-side fact.
   */
  abstract setBuildCoverForOwner(
    ownerId: string,
    buildId: string,
    assetId: string | null,
  ): Promise<boolean>;

  /** Storage keys for a set of asset ids, for batch URL signing. */
  abstract findKeysForOwner(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}
