import type {
  AssetEntity,
  AssetSubject,
  CommitAssetData,
  CreateAssetData,
  DisplayCandidate,
  DisplayVersion,
  PilotPhotoData,
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

  /**
   * The subject's owner, when the viewer may see it — for a build, their own
   * or one shared as Public or Unlisted; a null viewer is a signed-out visitor,
   * who sees only the shared ones. Null otherwise.
   */
  abstract findSubjectOwnerVisibleToViewer(
    viewerId: string | null,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<string | null>;

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

  /**
   * Sets or clears a post's cover — which must be one of that post's own
   * images. The same shape as a build's, for the same reason.
   */
  abstract setPostCoverForOwner(
    ownerId: string,
    postId: string,
    assetId: string | null,
  ): Promise<boolean>;

  /**
   * Makes a pending upload the pilot's profile photo: the row becomes the
   * processed square, the pilot points at it, and the photo it replaces is
   * deleted — all at once. Answers the replaced photo's storage keys for the
   * caller to delete, or null when the upload is not this pilot's pending one.
   */
  abstract setPilotPhotoForOwner(
    ownerId: string,
    assetId: string,
    photo: PilotPhotoData,
  ): Promise<readonly string[] | null>;

  /** Takes the pilot's photo away, answering its storage keys; none when they had none. */
  abstract clearPilotPhotoForOwner(ownerId: string): Promise<readonly string[]>;

  /** Where a pilot's photo is stored, for the address that redirects to it. */
  abstract findPilotPhotoKey(userId: string): Promise<string | null>;

  /**
   * Ready images with no display version yet, after `afterId` in id order —
   * the backfill's pages. Ordered by id so a page that failed is not asked
   * for again in the same run.
   */
  abstract findMissingDisplays(
    afterId: string | null,
    limit: number,
  ): Promise<readonly DisplayCandidate[]>;

  /**
   * Records a display version made for an image, unless it gained one in the
   * meantime, and the original's upright size beside it — older images were
   * recorded with a phone photo's sides swapped. Answers whether it was
   * recorded; when not, the caller deletes what it stored.
   */
  abstract attachDisplayForOwner(
    ownerId: string,
    assetId: string,
    display: DisplayVersion,
    upright: { readonly width: number; readonly height: number },
  ): Promise<boolean>;

  /** The owner's ready images among `assetIds`, with their versions' keys. */
  abstract findReadyForOwner(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<readonly AssetEntity[]>;

  abstract findKeysForOwner(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;

  /** The thumbnail's storage key for each asset, or the original's where it has none. */
  abstract findThumbKeysForOwner(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}
