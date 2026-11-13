import { Injectable } from '@nestjs/common';

import { BlocksFacade } from './abstract/blocks.facade';
import { BlocksRepository } from './abstract/blocks.repository';

const NOBODY: ReadonlySet<string> = new Set();

/** Serves the blocks facade out of the module's own repository. */
@Injectable()
export class BlocksFacadeImpl extends BlocksFacade {
  constructor(private readonly blocks: BlocksRepository) {
    super();
  }

  blockedBy(blockerId: string | null): Promise<ReadonlySet<string>> {
    return blockerId === null
      ? Promise.resolve(NOBODY)
      : this.blocks.blockedIds(blockerId);
  }

  isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    return this.blocks.isBlocked(blockerId, blockedId);
  }
}
