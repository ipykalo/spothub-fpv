import type { LikesDto } from '@spothub/shared';

/**
 * The likes module's public API — the only thing another module may inject.
 *
 * Counts only: `posts` and `builds` put them on the objects they answer with.
 * Whether the viewer may see those posts and builds was settled by the reads
 * that found them. Every id in the result is present, liked or not.
 */
export abstract class LikesFacade {
  abstract forPosts(
    viewerId: string | null,
    postIds: readonly string[],
  ): Promise<ReadonlyMap<string, LikesDto>>;

  abstract forBuilds(
    viewerId: string | null,
    buildIds: readonly string[],
  ): Promise<ReadonlyMap<string, LikesDto>>;
}
