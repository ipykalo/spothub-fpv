import { PartStatus, type PartDto } from '@spothub/shared';

import type { StatusStyle } from '../../core/ui/status-style';

/**
 * How a part's status looks.
 *
 * Shares the tone vocabulary with builds on purpose: `check_circle` green
 * means "good" and `error` red means "needs attention" on both screens, so
 * the two features teach the same visual language rather than each inventing
 * one.
 */
export const PART_STATUS_STYLES: Readonly<Record<PartStatus, StatusStyle>> = {
  // Fit to use. `ready` rather than `go`, because a serviceable part says
  // nothing about being deployed — the fitted count next to it does that.
  [PartStatus.Serviceable]: { icon: 'check_circle', tone: 'ready' },
  // Damaged. Must not be fitted to anything.
  [PartStatus.Broken]: { icon: 'error', tone: 'stop' },
  // Worn out, kept for the record.
  [PartStatus.Retired]: { icon: 'archive', tone: 'idle' },
};

/** A part in one of these conditions must never be offered for fitting. */
const UNFITTABLE: ReadonlySet<PartStatus> = new Set([
  PartStatus.Broken,
  PartStatus.Retired,
]);

/**
 * Units of this part not currently on a build.
 *
 * One row can stand for several physical items — four motors bought as a
 * pack are one row with `quantityOwned: 4` — so fitting one must not hide
 * the other three.
 */
export function availableUnits(part: PartDto): number {
  return Math.max(0, part.quantityOwned - part.fittedCount);
}

/** Whether this part can still be fitted to a build. */
export function isFittable(part: PartDto): boolean {
  return !UNFITTABLE.has(part.status) && availableUnits(part) > 0;
}
