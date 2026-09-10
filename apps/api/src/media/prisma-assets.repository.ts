import { Injectable } from '@nestjs/common';
import { type Asset, AssetKind, AssetStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { AssetsRepository } from './abstract/assets.repository';
import {
  type AssetEntity,
  AssetSubject,
  type CommitAssetData,
  type CreateAssetData,
} from './asset.entity';

type AssetWithThumb = Asset & { thumb: Asset | null };

const WITH_THUMB = { thumb: true } satisfies Prisma.AssetInclude;

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

      return tx.asset.update({
        where: { id },
        data: {
          status: AssetStatus.READY,
          sizeBytes: BigInt(data.sizeBytes),
          width: data.width,
          height: data.height,
          mime: data.mime,
          thumbId: thumb.id,
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
   * One lookup per subject kind, as a table rather than a `switch`.
   *
   * `build` is the only entry today, and a switch over a one-member union
   * reads to the compiler as a constant. A record keeps the shape the second
   * subject will need without writing a branch that is always taken.
   *
   * Each is a join inside this module's own repository rather than a call into
   * the owning module — which is what keeps media dependency-free, so `builds`
   * can depend on it without closing a cycle.
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
  };

  subjectBelongsToOwner(
    ownerId: string,
    subject: AssetSubject,
    subjectId: string,
  ): Promise<boolean> {
    return this.subjectOwnership[subject](ownerId, subjectId);
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

    const keys = [asset.storageKey, asset.thumb?.storageKey].filter(
      (key): key is string => typeof key === 'string',
    );

    // The link rows cascade, and `builds.cover_asset_id` is SET NULL, so a
    // build whose cover this was simply loses its cover.
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.deleteMany({ where: { id: assetId, ownerId } });

      if (asset.thumbId) {
        await tx.asset.deleteMany({ where: { id: asset.thumbId, ownerId } });
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
    sortOrder,
    createdAt: asset.createdAt,
  };
}
