import type { ReportPlaceKind, ReportReason, ReportSubject } from '@spothub/shared';

/** What a report is about: one post or one comment. */
export interface ReportRef {
  readonly subject: ReportSubject;
  readonly subjectId: string;
}

/** What a pilot files. */
export interface FileReportData {
  readonly reporterId: string;
  readonly reason: ReportReason;
  readonly details: string | null;
}

/** An open report as an admin reads it, with what it is about joined in. */
export interface OpenReportEntity {
  readonly id: string;
  readonly subject: ReportSubject;
  readonly reason: ReportReason;
  readonly details: string | null;
  /** Public names, already through `publicName()`. */
  readonly reporterName: string;
  readonly authorName: string;
  /** A post's title, or a comment's words in full; the mapper shortens them. */
  readonly text: string;
  readonly place: {
    readonly kind: ReportPlaceKind;
    readonly id: string;
    readonly slug: string | null;
  };
  readonly createdAt: Date;
}
