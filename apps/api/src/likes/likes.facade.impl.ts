import { Injectable } from '@nestjs/common';
import { type LikesDto, NO_LIKES } from '@spothub/shared';

import { LikesFacade } from './abstract/likes.facade';
import { LikesRepository } from './abstract/likes.repository';
import { LikeSubject } from './like.entity';

/** Serves the likes facade out of the module's own repository, one batch per list. */
@Injectable()
export class LikesFacadeImpl extends LikesFacade {
  constructor(private readonly likes: LikesRepository) {
    super();
  }

  forPosts(
    viewerId: string | null,
    postIds: readonly string[],
  ): Promise<ReadonlyMap<string, LikesDto>> {
    return this.forSubjects(LikeSubject.Post, viewerId, postIds);
  }

  forBuilds(
    viewerId: string | null,
    buildIds: readonly string[],
  ): Promise<ReadonlyMap<string, LikesDto>> {
    return this.forSubjects(LikeSubject.Build, viewerId, buildIds);
  }

  private async forSubjects(
    subject: LikeSubject,
    viewerId: string | null,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, LikesDto>> {
    const tallies = await this.likes.tallies(subject, ids, viewerId);
    return new Map(ids.map((id) => [id, tallies.get(id) ?? NO_LIKES]));
  }
}
