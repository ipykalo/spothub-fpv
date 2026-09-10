import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma';
import { PartFilter, PartsRepository } from '../abstract/parts.repository';
import type { CreatePartData, PartEntity, UpdatePartData } from '../entities/part.entity';
import { WITH_RELATIONS, toPartEntity } from './part-row.mapper';

/** The only place the part catalogue knows Prisma exists. */
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
        // "Has at least one unit in this condition" — a part is no longer in
        // one condition, so the filter asks about its units.
        ...(filter.condition ? { units: { some: { condition: filter.condition } } } : {}),
        ...(filter.search ? { OR: searchClauses(filter.search) } : {}),
      },
      include: WITH_RELATIONS,
      orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
    });

    return parts.map(toPartEntity);
  }

  async findOneForOwner(ownerId: string, id: string): Promise<PartEntity | null> {
    const part = await this.prisma.part.findFirst({
      where: { id, ownerId },
      include: WITH_RELATIONS,
    });

    return part ? toPartEntity(part) : null;
  }

  /**
   * The part and its units are created together: a kind of thing with no
   * objects behind it is not something the inventory should ever hold.
   */
  async create(data: CreatePartData): Promise<PartEntity> {
    const { quantity, ...fields } = data;

    const part = await this.prisma.part.create({
      data: {
        ...fields,
        spec: fields.spec,
        units: { create: Array.from({ length: quantity }, () => ({})) },
      },
      include: WITH_RELATIONS,
    });

    return toPartEntity(part);
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
}

/** Free-text search spans the two columns a person would actually recall. */
function searchClauses(search: string): Prisma.PartWhereInput[] {
  const contains = { contains: search, mode: 'insensitive' as const };
  return [{ manufacturer: contains }, { model: contains }];
}
