import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BlockedPilotDto } from '@spothub/shared';

import { BlocksRepository } from './abstract/blocks.repository';

/**
 * Business rules for one pilot blocking another. Knows nothing about HTTP or
 * Prisma. Nobody blocks themselves, and nobody blocks an admin: an admin
 * moderating a conversation must still be able to take part in it.
 */
@Injectable()
export class BlocksService {
  constructor(private readonly blocks: BlocksRepository) {}

  async list(blockerId: string): Promise<BlockedPilotDto[]> {
    return (await this.blocks.listFor(blockerId)).map((pilot) => ({
      userId: pilot.userId,
      name: pilot.name,
      blockedAt: pilot.blockedAt.toISOString(),
    }));
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const target = await this.blocks.findTarget(blockedId);

    if (!target) {
      throw new NotFoundException('Pilot not found');
    }

    if (target.isAdmin) {
      throw new BadRequestException('An admin cannot be blocked');
    }

    await this.blocks.add(blockerId, blockedId);
  }

  unblock(blockerId: string, blockedId: string): Promise<void> {
    return this.blocks.remove(blockerId, blockedId);
  }
}
