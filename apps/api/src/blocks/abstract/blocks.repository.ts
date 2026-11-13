import type { BlockTarget, BlockedPilotEntity } from '../block.entity';

/**
 * Persistence contract for pilot blocks. Every method takes the blocker
 * first: a pilot reads and changes only their own list.
 */
export abstract class BlocksRepository {
  /** The pilot to be blocked, or null when there is no such pilot. */
  abstract findTarget(userId: string): Promise<BlockTarget | null>;

  /** Idempotent: blocking twice is still one block. */
  abstract add(blockerId: string, blockedId: string): Promise<void>;

  /** Idempotent: unblocking someone not blocked changes nothing. */
  abstract remove(blockerId: string, blockedId: string): Promise<void>;

  /** Everyone this pilot blocked, most recent first, by public name. */
  abstract listFor(blockerId: string): Promise<BlockedPilotEntity[]>;

  abstract blockedIds(blockerId: string): Promise<ReadonlySet<string>>;

  abstract isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
}
