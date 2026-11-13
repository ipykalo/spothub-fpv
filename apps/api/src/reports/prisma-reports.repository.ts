import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ReportPlaceKind, ReportSubject, publicName } from '@spothub/shared';

import { PrismaService } from '../prisma';
import { ReportsRepository } from './abstract/reports.repository';
import type { FileReportData, OpenReportEntity, ReportRef } from './report.entity';

const NAME = { select: { displayName: true, pilotName: true } } as const;

/** What a report is about, joined: names only, never anyone's email. */
const WITH_SUBJECT = {
  reporter: NAME,
  post: { select: { id: true, title: true, slug: true, author: NAME } },
  comment: {
    select: {
      body: true,
      spotId: true,
      buildId: true,
      author: NAME,
      post: { select: { id: true, slug: true } },
    },
  },
} as const;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof WITH_SUBJECT }>;

@Injectable()
export class PrismaReportsRepository extends ReportsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async file(ref: ReportRef, data: FileReportData): Promise<void> {
    const reopened = {
      reason: data.reason,
      details: data.details,
      createdAt: new Date(),
      resolvedAt: null,
      resolvedById: null,
    };

    if (ref.subject === ReportSubject.Post) {
      await this.prisma.report.upsert({
        where: {
          reporterId_postId: { reporterId: data.reporterId, postId: ref.subjectId },
        },
        create: { ...data, postId: ref.subjectId },
        update: reopened,
      });
    } else {
      await this.prisma.report.upsert({
        where: {
          reporterId_commentId: { reporterId: data.reporterId, commentId: ref.subjectId },
        },
        create: { ...data, commentId: ref.subjectId },
        update: reopened,
      });
    }
  }

  async findOpen(): Promise<OpenReportEntity[]> {
    const rows = await this.prisma.report.findMany({
      where: { resolvedAt: null },
      include: WITH_SUBJECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return rows.flatMap((row) => {
      const entity = toEntity(row);
      return entity ? [entity] : [];
    });
  }

  async resolveWithSubject(reportId: string, adminId: string): Promise<boolean> {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, resolvedAt: null },
      select: { postId: true, commentId: true },
    });

    if (!report) {
      return false;
    }

    const { count } = await this.prisma.report.updateMany({
      where: {
        resolvedAt: null,
        ...(report.postId ? { postId: report.postId } : { commentId: report.commentId }),
      },
      data: { resolvedAt: new Date(), resolvedById: adminId },
    });

    return count > 0;
  }
}

/** A public name; someone who never gave one is "A pilot", as on a comment. */
function nameOf(user: { pilotName: string | null; displayName: string | null }): string {
  return publicName(user.pilotName, user.displayName) ?? 'A pilot';
}

function toEntity(row: ReportRow): OpenReportEntity | null {
  const base = {
    id: row.id,
    reason: row.reason,
    details: row.details,
    reporterName: nameOf(row.reporter),
    createdAt: row.createdAt,
  };

  if (row.post) {
    return {
      ...base,
      subject: ReportSubject.Post,
      authorName: nameOf(row.post.author),
      text: row.post.title,
      place: { kind: ReportPlaceKind.Post, id: row.post.id, slug: row.post.slug },
    };
  }

  const comment = row.comment;

  if (!comment) {
    return null;
  }

  const place = comment.post
    ? { kind: ReportPlaceKind.Post, id: comment.post.id, slug: comment.post.slug }
    : comment.spotId
      ? { kind: ReportPlaceKind.Spot, id: comment.spotId, slug: null }
      : comment.buildId
        ? { kind: ReportPlaceKind.Build, id: comment.buildId, slug: null }
        : null;

  return place
    ? {
        ...base,
        subject: ReportSubject.Comment,
        authorName: nameOf(comment.author),
        text: comment.body,
        place,
      }
    : null;
}
