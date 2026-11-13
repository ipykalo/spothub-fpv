import { z } from 'zod';

/**
 * Reports, defined once for both sides of the wire.
 *
 * A signed-in pilot flags a post or a comment that should not be on the site,
 * saying why; an admin reads the open reports on the Admin page and dismisses
 * them. Nobody else ever sees who reported what.
 */

/** What a report is about. */
export const ReportSubject = {
  Post: 'POST',
  Comment: 'COMMENT',
} as const;
export type ReportSubject = (typeof ReportSubject)[keyof typeof ReportSubject];

export const ReportReason = {
  Spam: 'SPAM',
  Abuse: 'ABUSE',
  Illegal: 'ILLEGAL',
  Other: 'OTHER',
} as const;
export type ReportReason = (typeof ReportReason)[keyof typeof ReportReason];

export const REPORT_REASON_LABELS: Readonly<Record<ReportReason, string>> = {
  [ReportReason.Spam]: 'Spam or advertising',
  [ReportReason.Abuse]: 'Abuse, harassment or hate',
  [ReportReason.Illegal]: 'Illegal or dangerous',
  [ReportReason.Other]: 'Something else',
};

export const MAX_REPORT_DETAILS = 500;

/** Why, in the reporter's words — the part of a report the form asks for. */
const reportWords = z.object({
  reason: z.enum([
    ReportReason.Spam,
    ReportReason.Abuse,
    ReportReason.Illegal,
    ReportReason.Other,
  ]),
  /** In the reporter's words. Empty is no details. */
  details: z
    .string()
    .trim()
    .max(MAX_REPORT_DETAILS, `Keep it under ${String(MAX_REPORT_DETAILS)} characters`)
    .nullable()
    .default(null)
    .transform((details) => (details === '' ? null : details)),
});

/** "Something else" says nothing on its own. */
const explained = (report: z.output<typeof reportWords>): boolean =>
  report.reason !== ReportReason.Other || report.details !== null;
const EXPLAIN = { message: 'Say what is wrong with it', path: ['details'] };

/** The reason and details alone, as the report form checks them. */
export const reportWordsSchema = reportWords.refine(explained, EXPLAIN);

export type ReportWordsDto = z.output<typeof reportWordsSchema>;

export const createReportSchema = reportWords
  .extend({
    subject: z.enum([ReportSubject.Post, ReportSubject.Comment]),
    subjectId: z.uuid(),
  })
  .refine(explained, EXPLAIN);

export type CreateReportDto = z.output<typeof createReportSchema>;

/** Where the reported words are, for the admin to open them. */
export const ReportPlaceKind = {
  Post: 'POST',
  Spot: 'SPOT',
  Build: 'BUILD',
} as const;
export type ReportPlaceKind = (typeof ReportPlaceKind)[keyof typeof ReportPlaceKind];

export const reportSchema = z.object({
  id: z.uuid(),
  subject: z.enum([ReportSubject.Post, ReportSubject.Comment]),
  reason: z.enum([
    ReportReason.Spam,
    ReportReason.Abuse,
    ReportReason.Illegal,
    ReportReason.Other,
  ]),
  details: z.string().nullable(),
  /** The reporter's public name. */
  reporterName: z.string(),
  /** Who wrote what was reported, by their public name. */
  authorName: z.string(),
  /** A post's title, or the start of a comment. Empty for a comment its asker has since deleted. */
  excerpt: z.string(),
  /** The page it is on: the post, or the spot, build or post a comment is under. */
  place: z.object({
    kind: z.enum([ReportPlaceKind.Post, ReportPlaceKind.Spot, ReportPlaceKind.Build]),
    id: z.uuid(),
    /** A post's slug, for its address. Null for a spot or build. */
    slug: z.string().nullable(),
  }),
  createdAt: z.string(),
});

export type ReportDto = z.output<typeof reportSchema>;

/** An admin closes a report — and every other open one about the same post or comment. */
export const resolveReportSchema = z.object({
  resolved: z.literal(true),
});

export type ResolveReportDto = z.output<typeof resolveReportSchema>;
