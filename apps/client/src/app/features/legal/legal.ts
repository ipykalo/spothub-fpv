/**
 * What both legal pages name: who runs the site and how to reach them, and
 * the day the wording last changed. One place, so the two never disagree.
 */
export const LEGAL = {
  /** The person responsible for the site and the data on it. */
  operator: 'DRAFT: operator name',
  /** Where they are, which is whose law the terms are read under. */
  country: 'DRAFT: country',
  /** Where a pilot writes about their data, or anything here. */
  contactEmail: 'DRAFT: contact address',
  /** Where the server is. */
  hostingLocation: 'DRAFT: Hetzner location',
  /** The day either page's wording last changed, as shown at the top. */
  updatedOn: '2026-11-12',
} as const;
