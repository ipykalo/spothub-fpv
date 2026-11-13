import type { ReportDto } from '@spothub/shared';

import type { OpenReportEntity } from './report.entity';

/** How much of a comment an admin reads in the list; the rest is on its page. */
export const EXCERPT_LENGTH = 280;

export function toReportDto(report: OpenReportEntity): ReportDto {
  const text = report.text.trim();

  return {
    id: report.id,
    subject: report.subject,
    reason: report.reason,
    details: report.details,
    reporterName: report.reporterName,
    authorName: report.authorName,
    excerpt:
      text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text,
    place: report.place,
    createdAt: report.createdAt.toISOString(),
  };
}
