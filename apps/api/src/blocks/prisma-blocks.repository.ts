import { Injectable } from '@nestjs/common';
import { publicName } from '@spothub/shared';

import { PrismaService } from '../prisma';
import { BlocksRepository } from './abstract/blocks.repository';
import type { BlockTarget, BlockedPilotEntity } from './block.entity';

/** The only place in the blocks feature that knows Prisma exists. */
@Injectable()
export class PrismaBlocksRepository extends BlocksRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findTarget(userId: string): Promise<BlockTarget | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return user ? { isAdmin: user.role === 'ADMIN' } : null;
  }

  async add(blockerId: string, blockedId: string): Promise<void> {
    // ON CONFLICT DO NOTHING against the primary key on the pair.
    await this.prisma.pilotBlock.createMany({
      data: [{ blockerId, blockedId }],
      skipDuplicates: true,
    });
  }

  async remove(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.pilotBlock.deleteMany({ where: { blockerId, blockedId } });
  }

  async listFor(blockerId: string): Promise<BlockedPilotEntity[]> {
    const rows = await this.prisma.pilotBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      select: {
        blockedId: true,
        createdAt: true,
        blocked: { select: { pilotName: true, displayName: true } },
      },
    });

    return rows.map((row) => ({
      userId: row.blockedId,
      name: publicName(row.blocked.pilotName, row.blocked.displayName) ?? 'A pilot',
      blockedAt: row.createdAt,
    }));
  }

  async blockedIds(blockerId: string): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.pilotBlock.findMany({
      where: { blockerId },
      select: { blockedId: true },
    });

    return new Set(rows.map((row) => row.blockedId));
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    return (await this.prisma.pilotBlock.count({ where: { blockerId, blockedId } })) > 0;
  }
}
