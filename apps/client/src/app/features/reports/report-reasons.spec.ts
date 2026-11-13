import { REPORT_REASON_LABELS, ReportReason } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { REPORT_REASON_OPTIONS } from './report-reasons';

describe('REPORT_REASON_OPTIONS', () => {
  it('offers every reason once, with its label, "Something else" last', () => {
    expect(REPORT_REASON_OPTIONS.map((option) => option.value)).toEqual([
      ReportReason.Spam,
      ReportReason.Abuse,
      ReportReason.Illegal,
      ReportReason.Other,
    ]);
    expect(REPORT_REASON_OPTIONS.map((option) => option.label)).toEqual(
      Object.values(REPORT_REASON_LABELS),
    );
  });
});
