import { ReportPlaceKind } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { reportLink } from './report-link';

describe('reportLink', () => {
  it('opens a post at its own address', () => {
    expect(reportLink({ kind: ReportPlaceKind.Post, id: 'p1', slug: 'a-post' })).toEqual([
      '/blog',
      'p1',
      'a-post',
    ]);
    expect(reportLink({ kind: ReportPlaceKind.Post, id: 'p1', slug: null })).toEqual([
      '/blog',
      'p1',
    ]);
  });

  it('opens the spot or build a comment is under', () => {
    expect(reportLink({ kind: ReportPlaceKind.Spot, id: 's1', slug: null })).toEqual([
      '/spots',
      's1',
    ]);
    expect(reportLink({ kind: ReportPlaceKind.Build, id: 'b1', slug: null })).toEqual([
      '/hangar',
      'b1',
    ]);
  });
});
