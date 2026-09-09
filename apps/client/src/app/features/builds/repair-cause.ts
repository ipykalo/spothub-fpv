import { RepairCause } from '@spothub/shared';

import type { StatusStyle } from '../../core/ui/status-style';

/**
 * How a repair cause looks.
 *
 * Uses the same tone vocabulary as build and part status, so red still means
 * "something went wrong" on this screen too.
 */
export const REPAIR_CAUSE_STYLES: Readonly<Record<RepairCause, StatusStyle>> = {
  // Hit something. The reason most arms are on their third replacement.
  [RepairCause.Crash]: { icon: 'error', tone: 'stop' },
  // Nothing broke suddenly; it wore out.
  [RepairCause.Wear]: { icon: 'schedule', tone: 'work' },
  // Nothing was wrong. Not a problem, so not coloured like one.
  [RepairCause.Upgrade]: { icon: 'upgrade', tone: 'ready' },
};
