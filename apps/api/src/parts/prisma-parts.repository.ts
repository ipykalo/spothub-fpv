import { Injectable } from '@nestjs/common';
import type { Part, PartSource, Prisma } from '@prisma/client';
import type { PartSpec } from '@spothub/shared';

import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePartData,
  CreatePartSourceData,
  PartEntity,
  PartSourceEntity,
  UpdatePartData,
  UpdatePartSourceData,
} from './part.entity';
import { PartFilter, PartsRepository } from './parts.repository';

type PartWithSources = Part & { sources: PartSource[] };

/**
 * The only place in the parts feature that knows Prisma exists.
 */
@Injectable()
export class PrismaPartsRepository extends PartsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findManyForOwner(ownerId: string, filter: PartFilter): Promise<PartEntity[]> {
    const parts = await this.prisma.part.findMany({
      where: {
        ownerId,
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.search ? { OR: searchClauses(filter.search) } : {}),
      },
      include: { sources: true },
      orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
    });

    return parts.map((part) => PrismaPartsRepository.toEntity(part));
  }

  async findOneForOwner(ownerId: string, id: string): Promise<PartEntity | null> {
    const part = await this.prisma.part.findFirst({
      where: { id, ownerId },
      include: { sources: true },
    });

    return part ? PrismaPartsRepository.toEntity(part) : null;
  }

  async create(data: CreatePartData): Promise<PartEntity> {
    const part = await this.prisma.part.create({
      data: { ...data, spec: data.spec },
      include: { sources: true },
    });

    return PrismaPartsRepository.toEntity(part);
  }

  /**
   * `updateMany` scoped by owner, then re-read. This makes it impossible to
   * update a row belonging to someone else, and returns null rather than
   * throwing when the id simply is not theirs.
   */
  async updateForOwner(
    ownerId: string,
    id: string,
    data: UpdatePartData,
  ): Promise<PartEntity | null> {
    const { spec, ...rest } = data;

    const { count } = await this.prisma.part.updateMany({
      where: { id, ownerId },
      data: {
        ...rest,
        ...(spec === undefined ? {} : { spec }),
      },
    });

    return count === 0 ? null : this.findOneForOwner(ownerId, id);
  }

  async deleteForOwner(ownerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.part.deleteMany({ where: { id, ownerId } });
    return count > 0;
  }

  /**
   * The part is re-checked against the owner before the source is written, so
   * a source cannot be attached to somebody else's part by guessing its id.
   */
  async addSourceForOwner(
    ownerId: string,
    partId: string,
    data: CreatePartSourceData,
  ): Promise<PartSourceEntity | null> {
    const owned = await this.prisma.part.findFirst({
      where: { id: partId, ownerId },
      select: { id: true },
    });

    if (!owned) {
      return null;
    }

    const source = await this.prisma.partSource.create({ data: { ...data, partId } });
    return PrismaPartsRepository.toSourceEntity(source);
  }

  /**
   * Scoped through the parent part's owner in the same `updateMany`, so a
   * source belonging to someone else cannot be reached by guessing two ids.
   */
  async updateSourceForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
    data: UpdatePartSourceData,
  ): Promise<PartSourceEntity | null> {
    const { count } = await this.prisma.partSource.updateMany({
      where: { id: sourceId, partId, part: { ownerId } },
      data: { ...data },
    });

    if (count === 0) {
      return null;
    }

    const source = await this.prisma.partSource.findUnique({ where: { id: sourceId } });
    return source ? PrismaPartsRepository.toSourceEntity(source) : null;
  }

  async deleteSourceForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.partSource.deleteMany({
      where: { id: sourceId, partId, part: { ownerId } },
    });

    return count > 0;
  }

  private static toEntity(part: PartWithSources): PartEntity {
    return {
      id: part.id,
      ownerId: part.ownerId,
      category: part.category,
      manufacturer: part.manufacturer,
      model: part.model,
      spec: (part.spec ?? {}) as PartSpec,
      quantityOwned: part.quantityOwned,
      status: part.status,
      notesMd: part.notesMd,
      sources: part.sources.map((source) => PrismaPartsRepository.toSourceEntity(source)),
      createdAt: part.createdAt,
      updatedAt: part.updatedAt,
    };
  }

  /** `Decimal` is a Prisma type and must not escape this file. */
  private static toSourceEntity(source: PartSource): PartSourceEntity {
    return {
      id: source.id,
      partId: source.partId,
      vendor: source.vendor,
      url: source.url,
      price: source.price === null ? null : source.price.toNumber(),
      currency: source.currency,
      isPurchase: source.isPurchase,
      purchasedOn: source.purchasedOn,
      quantity: source.quantity,
      capturedAt: source.capturedAt,
    };
  }
}

/** Free-text search spans the two columns a person would actually recall. */
function searchClauses(search: string): Prisma.PartWhereInput[] {
  const contains = { contains: search, mode: 'insensitive' as const };
  return [{ manufacturer: contains }, { model: contains }];
}
