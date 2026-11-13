import { REPORT_REASON_LABELS, ReportReason } from '@spothub/shared';

import { type ChoiceOption, choicesFrom } from '../../core/components/choice-option';

/** The reasons a report form offers, in the order they are asked. */
export const REPORT_REASON_OPTIONS: readonly ChoiceOption<ReportReason>[] = choicesFrom(
  Object.values(ReportReason),
  REPORT_REASON_LABELS,
);
