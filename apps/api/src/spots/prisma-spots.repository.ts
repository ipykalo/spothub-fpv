import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { SpotsRepository } from './abstract/spots.repository';
import type { CreateSpotData, SpotEntity, UpdateSpotData } from './spot.entity';

/**
 * The owner's display name rides along on every read — a join inside this
 * repository, not a call to the users module, and only the name: an owner's
 * email never leaves the users table through here.
 */
const WITH_OWNER_NAME = { owner: { select: { displayName: true } } } satisfies Prisma.SpotInclude;

type SpotRow = Prisma.SpotGetPayload<{ include: typeof WITH_OWNER_NAME }>;

/** What "shared" means: visible to other signed-in users, and finished. */
const SHARED: Prisma.SpotWhereInput = {
  visibility: { in: ['PUBLIC', 'UNLISTED'] },
  isDraft: false,
};

/** The only place in the spots feature that knows Prisma exists. */
@Injectable()
export class PrismaSpotsRepository extends SpotsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(ownerId: string): Promise<SpotEntity[]> {
    const rows = await this.prisma.spot.findMany({
      where: { ownerId },
      include: WITH_OWNER_NAME,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async findOneForOwner(ownerId: string, id: string): Promise<SpotEntity | null> {
    const row = await this.prisma.spot.findFirst({
      where: { id, ownerId },
      include: WITH_OWNER_NAME,
    });

    return row ? toEntity(row) : null;
  }

  async findVisibleForViewer(viewerId: string, id: string): Promise<SpotEntity | null> {
    const row = await this.prisma.spot.findFirst({
      where: { id, OR: [{ ownerId: viewerId }, SHARED] },
      include: WITH_OWNER_NAME,
    });

    return row ? toEntity(row) : null;
  }

  async findSharedForViewer(viewerId: string): Promise<SpotEntity[]> {
    const rows = await this.prisma.spot.findMany({
      where: { visibility: 'PUBLIC', isDraft: false, ownerId: { not: viewerId } },
      include: WITH_OWNER_NAME,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async slugExistsForOwner(ownerId: string, slug: string): Promise<boolean> {
    const found = await this.prisma.spot.findUnique({
      where: { ownerId_slug: { ownerId, slug } },
      select: { id: true },
    });

    return found !== null;
  }

  async create(data: CreateSpotData): Promise<SpotEntity> {
    const { hazards, video, ...rest } = data;

    const row = await this.prisma.spot.create({
      data: {
        ...rest,
        hazards: [...hazards],
        youtubeVideoId: video?.youtubeId ?? null,
        youtubeStartS: video?.startS ?? null,
      },
      include: WITH_OWNER_NAME,
    });

    return toEntity(row);
  }

  /**
   * `updateMany` scoped by owner, then re-read: a spot that is not the owner's
   * is simply not found, and cannot be written.
   */
  async updateForOwner(
    ownerId: string,
    id: string,
    data: UpdateSpotData,
  ): Promise<SpotEntity | null> {
    const { count } = await this.prisma.spot.updateMany({
      where: { id, ownerId },
      data: toUpdateInput(data),
    });

    return count === 0 ? null : this.findOneForOwner(ownerId, id);
  }

  async setCoverForOwner(
    ownerId: string,
    id: string,
    youtubeId: string,
    coverStorageKey: string,
  ): Promise<boolean> {
    // Scoped by the video as well as the owner: a cover made for a video the
    // spot no longer has must never be recorded against it.
    const { count } = await this.prisma.spot.updateMany({
      where: { id, ownerId, youtubeVideoId: youtubeId },
      data: { coverStorageKey },
    });

    return count > 0;
  }

  async deleteForOwner(ownerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.spot.deleteMany({ where: { id, ownerId } });
    return count > 0;
  }
}

function toUpdateInput(data: UpdateSpotData): Prisma.SpotUpdateManyMutationInput {
  const { hazards, video, ...rest } = data;

  return {
    ...rest,
    ...(hazards === undefined ? {} : { hazards: [...hazards] }),
    // The video is two columns, written together or not at all.
    ...(video === undefined
      ? {}
      : { youtubeVideoId: video?.youtubeId ?? null, youtubeStartS: video?.startS ?? null }),
  };
}

/** Coordinates are `numeric(9,6)` in the table and plain numbers everywhere above it. */
function toEntity(row: SpotRow): SpotEntity {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName: row.owner.displayName,
    name: row.name,
    slug: row.slug,
    lat: row.lat.toNumber(),
    lng: row.lng.toNumber(),
    locality: row.locality,
    terrain: row.terrain,
    access: row.access,
    difficulty: row.difficulty,
    hazards: [...row.hazards],
    descriptionMd: row.descriptionMd,
    accessNotesMd: row.accessNotesMd,
    visibility: row.visibility,
    isDraft: row.isDraft,
    video:
      row.youtubeVideoId === null
        ? null
        : { youtubeId: row.youtubeVideoId, startS: row.youtubeStartS },
    coverStorageKey: row.coverStorageKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
