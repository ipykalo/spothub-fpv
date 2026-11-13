import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type CreateReportDto, type ReportDto, ReportSubject } from '@spothub/shared';

import { CommentsFacade } from '../comments';
import { type AuthenticatedUser, assertAdmin } from '../common';
import { PostsFacade } from '../posts';
import { ReportsRepository } from './abstract/reports.repository';
import { toReportDto } from './reports.mapper';

const NOT_FOUND: Readonly<Record<ReportSubject, string>> = {
  [ReportSubject.Post]: 'Post not found',
  [ReportSubject.Comment]: 'Comment not found',
};

/**
 * Business rules for reports. Knows nothing about HTTP or Prisma.
 *
 * A pilot may report only what they can see — asked of the post's or the
 * comment's own module, and answered "not found" otherwise, so a report
 * cannot probe for a draft — and never their own words. Reading and closing
 * reports is an admin's, by role.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly posts: PostsFacade,
    private readonly comments: CommentsFacade,
  ) {}

  async file(reporterId: string, input: CreateReportDto): Promise<void> {
    const authorId =
      input.subject === ReportSubject.Post
        ? await this.posts.authorIfVisible(reporterId, input.subjectId)
        : await this.comments.authorIfVisible(reporterId, input.subjectId);

    if (authorId === null) {
      throw new NotFoundException(NOT_FOUND[input.subject]);
    }

    if (authorId === reporterId) {
      throw new BadRequestException('That is yours — edit or delete it instead');
    }

    await this.reports.file(
      { subject: input.subject, subjectId: input.subjectId },
      { reporterId, reason: input.reason, details: input.details },
    );
  }

  async listOpen(viewer: AuthenticatedUser): Promise<ReportDto[]> {
    assertAdmin(viewer);
    const reports = await this.reports.findOpen();
    return reports.map(toReportDto);
  }

  async resolve(viewer: AuthenticatedUser, reportId: string): Promise<ReportDto[]> {
    assertAdmin(viewer);

    if (!(await this.reports.resolveWithSubject(reportId, viewer.id))) {
      throw new NotFoundException('Report not found');
    }

    return this.listOpen(viewer);
  }
}
