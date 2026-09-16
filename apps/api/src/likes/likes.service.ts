import { Injectable, NotFoundException } from '@nestjs/common';
import { type LikesDto, NO_LIKES } from '@spothub/shared';

import { LikesRepository } from './abstract/likes.repository';
import { type LikeRef, LikeSubject } from './like.entity';

const SUBJECT_NAMES: Readonly<Record<LikeSubject, string>> = {
  [LikeSubject.Post]: 'Post',
  [LikeSubject.Build]: 'Build',
};

/**
 * Business rules for likes. Knows nothing about HTTP or Prisma.
 *
 * Every action starts from the same question: may this person open the post
 * or build? One they cannot is not found — for reading its count as much as
 * for liking it — so a private one's existence is not given away.
 */
@Injectable()
export class LikesService {
  constructor(private readonly likes: LikesRepository) {}

  /** A null viewer is a signed-out visitor, who sees the count but never likes. */
  async get(viewerId: string | null, ref: LikeRef): Promise<LikesDto> {
    await this.assertVisible(viewerId, ref);
    return this.tally(viewerId, ref);
  }

  async like(userId: string, ref: LikeRef): Promise<LikesDto> {
    await this.assertVisible(userId, ref);
    await this.likes.addForUser(userId, ref);
    return this.tally(userId, ref);
  }

  async unlike(userId: string, ref: LikeRef): Promise<LikesDto> {
    await this.assertVisible(userId, ref);
    await this.likes.removeForUser(userId, ref);
    return this.tally(userId, ref);
  }

  private async assertVisible(viewerId: string | null, ref: LikeRef): Promise<void> {
    if (!(await this.likes.subjectVisibleToViewer(viewerId, ref))) {
      throw new NotFoundException(`${SUBJECT_NAMES[ref.subject]} not found`);
    }
  }

  private async tally(viewerId: string | null, ref: LikeRef): Promise<LikesDto> {
    const tallies = await this.likes.tallies(ref.subject, [ref.subjectId], viewerId);
    return tallies.get(ref.subjectId) ?? NO_LIKES;
  }
}
