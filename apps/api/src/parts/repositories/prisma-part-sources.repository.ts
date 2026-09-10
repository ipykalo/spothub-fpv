import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { PartSourcesRepository } from '../abstract/part-sources.repository';
import type {
  CreatePartSourceData,
  PartSourceEntity,
  UpdatePartSourceData,
} from '../entities/part-source.entity';
import { toPartSourceEntity } from './part-row.mapper';

/** The only place the sources feature knows Prisma exists. */
@Injectable()
export class PrismaPartSourcesRepository extends PartSourcesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * The part is re-checked against the owner before the source is written, so
   * a source cannot be attached to somebody else's part by guessing its id.
   */
  async addForOwner(
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
    return toPartSourceEntity(source);
  }

  /**
   * Scoped through the parent part's owner in the same `updateMany`, so a
   * source belonging to someone else cannot be reached by guessing two ids.
   */
  async updateForOwner(
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
    return source ? toPartSourceEntity(source) : null;
  }

  async deleteForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.partSource.deleteMany({
      where: { id: sourceId, partId, part: { ownerId } },
    });

    return count > 0;
  }
}
