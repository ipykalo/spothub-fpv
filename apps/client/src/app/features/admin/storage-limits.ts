import type { ChoiceOption } from '../../core/components/choice-option';
import { formatBytes } from '../../core/format/bytes';

const GB = 1024 ** 3;

/**
 * The limits an admin picks from. A list rather than a number field: nobody
 * means 1.37 GB, and a list cannot be mistyped by a factor of a thousand.
 */
export const STORAGE_LIMITS: readonly number[] = [
  0.5 * GB,
  1 * GB,
  2 * GB,
  5 * GB,
  10 * GB,
  20 * GB,
  50 * GB,
  100 * GB,
];

/**
 * The presets as picker options, with `current` added in order when it is
 * not one of them — a limit set some other way must still show as chosen.
 */
export function storageLimitChoices(current: number | null): ChoiceOption<number>[] {
  const values =
    current === null || STORAGE_LIMITS.includes(current)
      ? STORAGE_LIMITS
      : [...STORAGE_LIMITS, current].sort((a, b) => a - b);

  return values.map((value) => ({ value, label: formatBytes(value) }));
}
