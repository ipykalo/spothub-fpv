import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateSpotCommentDto,
  MarkAnswerDto,
  SpotCommentsDto,
  UnreadSpotCommentsDto,
  UpdateSpotCommentDto,
} from '@spothub/shared';

import { SpotsFacade } from '../spots';
import { SpotCommentsRepository } from './abstract/spot-comments.repository';
import { toSpotCommentsDto } from './spot-comments.mapper';

/**
 * Business rules for questions and replies on spots. Knows nothing about HTTP
 * or Prisma.
 *
 * Every action starts from the same question to `SpotsFacade`: may this person
 * open the spot, and whose is it? A spot they cannot open has no comments as
 * far as they can tell — the answer is "not found", never "forbidden", so a
 * private spot's existence is not given away either. Every change answers
 * with the whole conversation, so the page never has to rebuild it.
 */
@Injectable()
export class SpotCommentsService {
  constructor(
    private readonly comments: SpotCommentsRepository,
    private readonly spots: SpotsFacade,
  ) {}

  async list(viewerId: string, spotId: string): Promise<SpotCommentsDto> {
    const ownerId = await this.ownerOfVisibleSpot(viewerId, spotId);
    return this.conversation(viewerId, spotId, ownerId);
  }

  async create(
    viewerId: string,
    spotId: string,
    input: CreateSpotCommentDto,
  ): Promise<SpotCommentsDto> {
    const ownerId = await this.ownerOfVisibleSpot(viewerId, spotId);

    if (input.parentId !== null) {
      const parent = await this.comments.findOneForSpot(spotId, input.parentId);

      if (!parent) {
        throw new NotFoundException('Question not found');
      }

      if (parent.parentId !== null) {
        throw new BadRequestException('Replies go one level deep — reply to the question instead');
      }
    }

    await this.comments.create({
      spotId,
      authorId: viewerId,
      parentId: input.parentId,
      body: input.body,
    });

    return this.conversation(viewerId, spotId, ownerId);
  }

  async update(
    viewerId: string,
    spotId: string,
    commentId: string,
    input: UpdateSpotCommentDto,
  ): Promise<SpotCommentsDto> {
    const ownerId = await this.ownerOfVisibleSpot(viewerId, spotId);
    const updated = await this.comments.updateBodyForAuthor(viewerId, spotId, commentId, input.body);

    if (!updated) {
      throw new NotFoundException('Comment not found');
    }

    return this.conversation(viewerId, spotId, ownerId);
  }

  async remove(viewerId: string, spotId: string, commentId: string): Promise<SpotCommentsDto> {
    const ownerId = await this.ownerOfVisibleSpot(viewerId, spotId);
    const deleted = await this.comments.deleteForViewer(viewerId, spotId, commentId);

    if (!deleted) {
      throw new NotFoundException('Comment not found');
    }

    return this.conversation(viewerId, spotId, ownerId);
  }

  async setAnswer(
    viewerId: string,
    spotId: string,
    commentId: string,
    input: MarkAnswerDto,
  ): Promise<SpotCommentsDto> {
    const ownerId = await this.ownerOfVisibleSpot(viewerId, spotId);
    const set = await this.comments.setAnswerForAskerOrSpotOwner(
      viewerId,
      spotId,
      commentId,
      input.isAnswer,
    );

    if (!set) {
      throw new NotFoundException('Reply not found');
    }

    return this.conversation(viewerId, spotId, ownerId);
  }

  async markRead(viewerId: string, spotId: string): Promise<void> {
    const ownerId = await this.ownerOfVisibleSpot(viewerId, spotId);

    // Unread counts only ever reach a spot's owner, so only the owner's reading is recorded.
    if (ownerId === viewerId) {
      await this.comments.markReadForUser(viewerId, spotId);
    }
  }

  async unread(viewerId: string): Promise<UnreadSpotCommentsDto> {
    const counts = await this.comments.countUnreadForOwner(viewerId);
    let total = 0;

    for (const count of counts.values()) {
      total += count;
    }

    return { total, bySpot: Object.fromEntries(counts) };
  }

  private async ownerOfVisibleSpot(viewerId: string, spotId: string): Promise<string> {
    const ownerId = await this.spots.ownerIfVisible(viewerId, spotId);

    if (ownerId === null) {
      throw new NotFoundException('Spot not found');
    }

    return ownerId;
  }

  private async conversation(
    viewerId: string,
    spotId: string,
    ownerId: string,
  ): Promise<SpotCommentsDto> {
    const comments = await this.comments.findManyForSpot(spotId);
    return toSpotCommentsDto(comments, { viewerId, ownerId });
  }
}
