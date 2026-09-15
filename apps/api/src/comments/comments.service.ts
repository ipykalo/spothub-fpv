import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CommentSubject,
  type ConversationDto,
  type CreateCommentDto,
  type MarkAnswerDto,
  type UnreadCommentsDto,
  type UnreadCountsDto,
  type UpdateCommentDto,
} from '@spothub/shared';

import { BuildsFacade } from '../builds';
import { SpotsFacade } from '../spots';
import { CommentsRepository } from './abstract/comments.repository';
import type { SubjectRef } from './comment.entity';
import { toConversationDto } from './comments.mapper';

/**
 * Business rules for questions and replies on spots and builds. Knows nothing
 * about HTTP or Prisma.
 *
 * Every action starts from the same question to the subject's own module: may
 * this person open it, and whose is it? A spot or build they cannot open has
 * no comments as far as they can tell — the answer is "not found", never
 * "forbidden", so a private one's existence is not given away either. Every
 * change answers with the whole conversation, so the page never has to
 * rebuild it.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly comments: CommentsRepository,
    private readonly spots: SpotsFacade,
    private readonly builds: BuildsFacade,
  ) {}

  /** A null viewer is a signed-out visitor, who may read a shared build's conversation only. */
  async list(viewerId: string | null, ref: SubjectRef): Promise<ConversationDto> {
    const ownerId = await this.ownerOfVisibleSubject(viewerId, ref);
    return this.conversation(viewerId, ref, ownerId);
  }

  async create(viewerId: string, ref: SubjectRef, input: CreateCommentDto): Promise<ConversationDto> {
    const ownerId = await this.ownerOfVisibleSubject(viewerId, ref);

    if (input.parentId !== null) {
      const parent = await this.comments.findOneOn(ref, input.parentId);

      if (!parent) {
        throw new NotFoundException('Question not found');
      }

      if (parent.parentId !== null) {
        throw new BadRequestException('Replies go one level deep — reply to the question instead');
      }

      if (parent.deletedAt !== null) {
        throw new BadRequestException('That question was deleted and takes no new replies');
      }
    }

    await this.comments.create(ref, {
      authorId: viewerId,
      parentId: input.parentId,
      body: input.body,
    });

    return this.conversation(viewerId, ref, ownerId);
  }

  async update(
    viewerId: string,
    ref: SubjectRef,
    commentId: string,
    input: UpdateCommentDto,
  ): Promise<ConversationDto> {
    const ownerId = await this.ownerOfVisibleSubject(viewerId, ref);
    const updated = await this.comments.updateBodyForAuthor(viewerId, ref, commentId, input.body);

    if (!updated) {
      throw new NotFoundException('Comment not found');
    }

    return this.conversation(viewerId, ref, ownerId);
  }

  async remove(viewerId: string, ref: SubjectRef, commentId: string): Promise<ConversationDto> {
    const ownerId = await this.ownerOfVisibleSubject(viewerId, ref);
    const deleted = await this.comments.deleteForViewer(viewerId, ref, commentId);

    if (!deleted) {
      throw new NotFoundException('Comment not found');
    }

    return this.conversation(viewerId, ref, ownerId);
  }

  async setAnswer(
    viewerId: string,
    ref: SubjectRef,
    commentId: string,
    input: MarkAnswerDto,
  ): Promise<ConversationDto> {
    const ownerId = await this.ownerOfVisibleSubject(viewerId, ref);
    const set = await this.comments.setAnswerForAskerOrOwner(
      viewerId,
      ref,
      commentId,
      input.isAnswer,
    );

    if (!set) {
      throw new NotFoundException('Reply not found');
    }

    return this.conversation(viewerId, ref, ownerId);
  }

  async markRead(viewerId: string, ref: SubjectRef): Promise<void> {
    const ownerId = await this.ownerOfVisibleSubject(viewerId, ref);

    // Unread counts only ever reach the owner, so only the owner's reading is recorded.
    if (ownerId === viewerId) {
      await this.comments.markReadForUser(viewerId, ref);
    }
  }

  async unread(viewerId: string): Promise<UnreadCommentsDto> {
    const counts = await this.comments.countUnreadForOwner(viewerId);

    return {
      spots: summarize(counts[CommentSubject.Spot]),
      builds: summarize(counts[CommentSubject.Build]),
    };
  }

  private async ownerOfVisibleSubject(viewerId: string | null, ref: SubjectRef): Promise<string> {
    const isSpot = ref.subject === CommentSubject.Spot;
    let ownerId: string | null;

    if (isSpot) {
      // Spots are never shown to a signed-out visitor.
      ownerId = viewerId === null ? null : await this.spots.ownerIfVisible(viewerId, ref.subjectId);
    } else {
      ownerId = await this.builds.ownerIfVisible(viewerId, ref.subjectId);
    }

    if (ownerId === null) {
      throw new NotFoundException(isSpot ? 'Spot not found' : 'Build not found');
    }

    return ownerId;
  }

  private async conversation(
    viewerId: string | null,
    ref: SubjectRef,
    ownerId: string,
  ): Promise<ConversationDto> {
    const comments = await this.comments.findManyOn(ref);
    return toConversationDto(comments, { viewerId, ownerId });
  }
}

function summarize(counts: ReadonlyMap<string, number>): UnreadCountsDto {
  let total = 0;

  for (const count of counts.values()) {
    total += count;
  }

  return { total, bySubject: Object.fromEntries(counts) };
}
