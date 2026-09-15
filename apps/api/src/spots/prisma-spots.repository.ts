import { Injectable } from '@nestjs/common';
import type { Prisma, Spot } from '@prisma/client';

import { PrismaService } from '../prisma';
import { SpotsRepository } from './abstract/spots.repository';
import type { CreateSpotData, SpotEntity, UpdateSpotData } from './spot.entity';

/** The only place in the spots feature that knows Prisma exists. */
@Injectable()
export class PrismaSpotsRepository extends SpotsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(ownerId: string): Promise<SpotEntity[]> {
    const rows = await this.prisma.spot.findMany({
      where: { ownerId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    return rows.map(toEntity);
  }

  async findOneForOwner(ownerId: string, id: string): Promise<SpotEntity | null> {
    const row = await this.prisma.spot.findFirst({ where: { id, ownerId } });
    return row ? toEntity(row) : null;
  }

  async slugExistsForOwner(ownerId: string, slug: string): Promise<boolean> {
    const found = await this.prisma.spot.findUnique({
      where: { ownerId_slug: { ownerId, slug } },
      select: { id: true },
    });

    return found !== null;
  }

  async create(data: CreateSpotData): Promise<SpotEntity> {
    const row = await this.prisma.spot.create({
      data: { ...data, hazards: [...data.hazards] },
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

  async deleteForOwner(ownerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.spot.deleteMany({ where: { id, ownerId } });
    return count > 0;
  }
}

function toUpdateInput(data: UpdateSpotData): Prisma.SpotUpdateManyMutationInput {
  const { hazards, ...rest } = data;
  return { ...rest, ...(hazards === undefined ? {} : { hazards: [...hazards] }) };
}

/** Coordinates are `numeric(9,6)` in the table and plain numbers everywhere above it. */
function toEntity(row: Spot): SpotEntity {
  return {
    id: row.id,
    ownerId: row.ownerId,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
