import { Module } from '@nestjs/common';

import { BlocksFacade } from './abstract/blocks.facade';
import { BlocksRepository } from './abstract/blocks.repository';
import { BlocksController } from './blocks.controller';
import { BlocksFacadeImpl } from './blocks.facade.impl';
import { BlocksService } from './blocks.service';
import { PrismaBlocksRepository } from './prisma-blocks.repository';

/**
 * Pilot blocks: one pilot keeping another away from what they own.
 *
 * Depends on no feature module (whether the pilot exists, and is an admin, is
 * a read of `users` inside its own repository), so `comments` can depend on
 * `BlocksFacade` without closing a cycle. `BlocksFacade` is the only provider
 * exported.
 */
@Module({
  controllers: [BlocksController],
  providers: [
    BlocksService,
    { provide: BlocksRepository, useClass: PrismaBlocksRepository },
    { provide: BlocksFacade, useClass: BlocksFacadeImpl },
  ],
  exports: [BlocksFacade],
})
export class BlocksModule {}
