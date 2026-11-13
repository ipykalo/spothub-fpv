import { Injectable } from '@nestjs/common';
import { type Asset, AssetKind, AssetStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { AssetsRepository } from './abstract/assets.repository';
import {
  type AssetEntity,
  AssetSubject,
  type CommitAssetData,
  type CreateAssetData,
  type DisplayCandidate,
  type DisplayVersion,
} from './asset.entity';

type AssetWithThumb = Asset & { thumb: Asset | null; display: Asset | null };

/** An image's generated versions, read with it wherever it is read. */
const WITH_THUMB = { thumb: true, display: true } satisfies Prisma.AssetInclude;

/** The only place this feature knows Prisma exists. */
@Injectable()
export class PrismaAssetsRepository extends AssetsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: CreateAssetData): Promise<AssetEntity> {
    const asset = await this.prisma.asset.create({
      data: {
        ownerId: data.ownerId,
        storageKey: data.storageKey,
        fileName: data.fileName,
        mime: data.mime,
        sizeBytes: BigInt(data.sizeBytes),
      },
      include: WITH_THUMB,
    });

    return toEntity(asset);
  }

  async findOneForOwner(ownerId: string, id: string): Promise<AssetEntity | null> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, ownerId },
      include: WITH_THUMB,
    });

    return asset ? toEntity(asset) : null;
  }

  /**
   * The thumbnail row and the update land together: a half-committed asset
   * with a thumbnail key pointing at nothing would render as a broken image
   * forever.
   */
  async commitForOwner(
    ownerId: string,
    id: string,
    data: CommitAssetData,
  ): Promise<AssetEntity | null> {
    const owned = await this.prisma.asset.findFirst({
      where: { id, ownerId },
      select: { id: true },
    });

    if (!owned) {
      return null;
    }

    const asset = await this.prisma.$transaction(async (tx) => {
      const thumb = await tx.asset.create({
        data: {
          ownerId,
          kind: AssetKind.THUMB,
          status: AssetStatus.READY,
          storageKey: data.thumbStorageKey,
          mime: 'image/webp',
        },
      });
      const display = await tx.asset.create({
        data: displayRow(ownerId, data.display),
      });

      return tx.asset.update({
        where: { id },
        data: {
          status: AssetStatus.READY,
          sizeBytes: BigInt(data.sizeBytes),
          width: data.width,
          height: data.height,
          mime: data.mime,
          thumbId: thumb.id,
          displayId: display.id,
        },
        include: WITH_THUMB,
      });
    });

    return toEntity(asset);
  }

  async markFailedForOwner(ownerId: string, id: string): Promise<void> {
    await this.prisma.asset.updateMany({
      where: { id, ownerId },
      data: { status: AssetStatus.FAILED },
    });
  }

  /**
   * One lookup per subject kind, as a table rather than a `switch`: a subject
   * added to `AssetSubject` without an entry here fails to compile.
   *
   * Each is a join inside this module's own repository rather than a call into
   * the owning module — which is what keeps media dependency-free, so `builds`
   * and `posts` can depend on it without closing a cycle.
   */
  private readonly subjectOwnership: Record<
    AssetSubject,
    (ownerId: string, subjectId: string) => Promise<boolean>
  > = {
    [AssetSubject.Build]: async (ownerId, subjectId) => {
      const build = await this.prisma.build.findFirst({
        where: { id: subjectId, ownerId },
        select: { id: true },
      });
      return build !== null;
    },
    [AssetSubject.Post]: async (ownerId, subjectId) => {
      const post = await this.prisma.post.findFirst({
        where: { id: subjectId, authorId: ownerId },
        select: { id: true },
      });
      return post !== null;
    },
  };

  subjectBelongsToOwner(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<boolean> {
    return this.subjectOwnership[subject](ownerId, subjectId);
  }

  /** The same table, for reading images someone shared. */
  private readonly subjectVisibility: Record<
    AssetSubject,
    (viewerId: string | null, subjectId: string) => Promise<string | null>
  > = {
    [AssetSubject.Build]: async (viewerId, subjectId) => {
      const shared = { visibility: { in: ['PUBLIC' as const, 'UNLISTED' as const] } };
      const build = await this.prisma.build.findFirst({
        where: {
          id: subjectId,
          ...(viewerId === null ? shared : { OR: [{ ownerId: viewerId }, shared] }),
        },
        select: { ownerId: true },
      });
      return build?.ownerId ?? null;
    },
    [AssetSubject.Post]: async (viewerId, subjectId) => {
      // A post an admin hid is its author's alone, as its page is.
      const shared = {
        visibility: { in: ['PUBLIC' as const, 'UNLISTED' as const] },
        hiddenAt: null,
      };
      const post = await this.prisma.post.findFirst({
        where: {
          id: subjectId,
          ...(viewerId === null ? shared : { OR: [{ authorId: viewerId }, shared] }),
        },
        select: { authorId: true },
      });
      return post?.authorId ?? null;
    },
  };

  findSubjectOwnerVisibleToViewer(
    viewerId: string | null,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<string | null> {
    return this.subjectVisibility[subject](viewerId, subjectId);
  }

  async linkForOwner(
    ownerId: string,
    assetId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<boolean> {
    const owned = await this.prisma.asset.findFirst({
      where: { id: assetId, ownerId },
      select: { id: true },
    });

    if (!owned) {
      return false;
    }

    const last = await this.prisma.assetLink.findFirst({
      where: { subjectType: subject, subjectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    // Uploading the same photo twice to one build is a no-op, not an error.
    await this.prisma.assetLink.upsert({
      where: {
        assetId_subjectType_subjectId: { assetId, subjectType: subject, subjectId },
      },
      create: {
        assetId,
        subjectType: subject,
        subjectId,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      update: {},
    });

    return true;
  }

  async findManyForSubject(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<AssetEntity[]> {
    const links = await this.prisma.assetLink.findMany({
      where: {
        subjectType: subject,
        subjectId,
        // Scoped by the asset's own owner, so a guessed subject id returns
        // nothing rather than someone else's photos.
        asset: { ownerId, status: AssetStatus.READY },
      },
      include: { asset: { include: WITH_THUMB } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return links.map((link) => toEntity(link.asset, link.sortOrder));
  }

  async deleteForOwner(ownerId: string, assetId: string): Promise<readonly string[]> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, ownerId },
      include: WITH_THUMB,
    });

    if (!asset) {
      return [];
    }

    const keys = [
      asset.storageKey,
      asset.thumb?.storageKey,
      asset.display?.storageKey,
    ].filter((key): key is string => typeof key === 'string');

    // The link rows cascade, and `builds.cover_asset_id` is SET NULL, so a
    // build whose cover this was simply loses its cover.
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.deleteMany({ where: { id: assetId, ownerId } });

      const derived = [asset.thumbId, asset.displayId].filter(
        (id): id is string => id !== null,
      );

      if (derived.length > 0) {
        await tx.asset.deleteMany({ where: { id: { in: derived }, ownerId } });
      }
    });

    return keys;
  }

  async reorderForSubject(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    await this.prisma.$transaction(
      assetIds.map((assetId, index) =>
        this.prisma.assetLink.updateMany({
          where: {
            assetId,
            subjectType: subject,
            subjectId,
            asset: { ownerId },
          },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  async setBuildCoverForOwner(
    ownerId: string,
    buildId: string,
    assetId: string | null,
  ): Promise<boolean> {
    if (assetId !== null) {
      // The cover must be one of this build's own photos, or a guessed id
      // would put someone else's picture on the card.
      const link = await this.prisma.assetLink.findFirst({
        where: {
          assetId,
          subjectType: AssetSubject.Build,
          subjectId: buildId,
          asset: { ownerId, status: AssetStatus.READY },
        },
        select: { id: true },
      });

      if (!link) {
        return false;
      }
    }

    const { count } = await this.prisma.build.updateMany({
      where: { id: buildId, ownerId },
      data: { coverAssetId: assetId },
    });

    return count > 0;
  }

  async setPostCoverForOwner(
    ownerId: string,
    postId: string,
    assetId: string | null,
  ): Promise<boolean> {
    if (assetId !== null) {
      // The cover must be one of this post's own images, or a guessed id would
      // put someone else's picture at the top of the post.
      const link = await this.prisma.assetLink.findFirst({
        where: {
          assetId,
          subjectType: AssetSubject.Post,
          subjectId: postId,
          asset: { ownerId, status: AssetStatus.READY },
        },
        select: { id: true },
      });

      if (!link) {
        return false;
      }
    }

    const { count } = await this.prisma.post.updateMany({
      where: { id: postId, authorId: ownerId },
      data: { coverAssetId: assetId },
    });

    return count > 0;
  }

  async findThumbKeysForOwner(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...assetIds] }, ownerId, status: AssetStatus.READY },
      include: WITH_THUMB,
    });

    return new Map(
      assets.map((asset) => [asset.id, asset.thumb?.storageKey ?? asset.storageKey]),
    );
  }

  async findMissingDisplays(
    afterId: string | null,
    limit: number,
  ): Promise<readonly DisplayCandidate[]> {
    return this.prisma.asset.findMany({
      where: {
        kind: AssetKind.IMAGE,
        status: AssetStatus.READY,
        displayId: null,
        ...(afterId === null ? {} : { id: { gt: afterId } }),
      },
      select: { id: true, ownerId: true, storageKey: true },
      orderBy: { id: 'asc' },
      take: limit,
    });
  }

  async attachDisplayForOwner(
    ownerId: string,
    assetId: string,
    display: DisplayVersion,
    upright: { readonly width: number; readonly height: number },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({ data: displayRow(ownerId, display) });
      // Only where it still has none: a second run, or a photo deleted while
      // its display was being made, leaves this row to be taken back.
      const { count } = await tx.asset.updateMany({
        where: { id: assetId, ownerId, displayId: null },
        data: { displayId: created.id, width: upright.width, height: upright.height },
      });

      if (count === 0) {
        await tx.asset.delete({ where: { id: created.id } });
      }

      return count > 0;
    });
  }

  async findReadyForOwner(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<readonly AssetEntity[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...assetIds] }, ownerId, status: AssetStatus.READY },
      include: WITH_THUMB,
    });

    return assets.map((asset) => toEntity(asset));
  }

  async findKeysForOwner(
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...assetIds] }, ownerId, status: AssetStatus.READY },
      select: { id: true, storageKey: true },
    });

    return new Map(assets.map((asset) => [asset.id, asset.storageKey]));
  }
}

/** `BigInt` is a Prisma type and must not escape this file. */
function toEntity(asset: AssetWithThumb, sortOrder = 0): AssetEntity {
  return {
    id: asset.id,
    ownerId: asset.ownerId,
    status: asset.status,
    storageKey: asset.storageKey,
    fileName: asset.fileName,
    mime: asset.mime,
    sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
    width: asset.width,
    height: asset.height,
    thumbKey: asset.thumb?.storageKey ?? null,
    displayKey: asset.display?.storageKey ?? null,
    sortOrder,
    createdAt: asset.createdAt,
  };
}

/**
 * A display version's own row. Its size is recorded, unlike a thumbnail's, so
 * it counts toward the owner's storage: it is real bytes they asked for.
 */
function displayRow(
  ownerId: string,
  display: DisplayVersion,
): Prisma.AssetUncheckedCreateInput {
  return {
    ownerId,
    kind: AssetKind.DISPLAY,
    status: AssetStatus.READY,
    storageKey: display.storageKey,
    mime: 'image/webp',
    sizeBytes: BigInt(display.sizeBytes),
    width: display.width,
    height: display.height,
  };
}
