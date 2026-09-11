import {
  PART_CATEGORY_LABELS,
  PartCondition,
  type PartDto,
  type PartUnitDto,
} from '@spothub/shared';

import type { StatusStyle } from '../../core/ui/status-style';

/**
 * How a unit's condition looks.
 *
 * Shares the tone vocabulary with builds on purpose: `check_circle` green
 * means "good" and `error` red means "needs attention" on both screens, so the
 * two features teach the same visual language rather than each inventing one.
 */
export const PART_CONDITION_STYLES: Readonly<Record<PartCondition, StatusStyle>> = {
  // Fit to use. `ready` rather than `go`, because being serviceable says
  // nothing about being deployed — the fitted count next to it does that.
  [PartCondition.Serviceable]: { icon: 'check_circle', tone: 'ready' },
  [PartCondition.Broken]: { icon: 'error', tone: 'stop' },
  [PartCondition.Retired]: { icon: 'archive', tone: 'idle' },
};

/** A unit in one of these conditions must never be offered for fitting. */
const UNFITTABLE: ReadonlySet<PartCondition> = new Set([
  PartCondition.Broken,
  PartCondition.Retired,
]);

/** One physical unit that could be fitted right now. */
export interface FittableUnit {
  readonly unitId: string;
  readonly partId: string;
  readonly label: string;
  readonly part: PartDto;
}

export function unitIsFittable(unit: PartUnitDto): boolean {
  return !unit.fitted && !UNFITTABLE.has(unit.condition);
}

export function unitCount(part: PartDto): number {
  return part.units.length;
}

export function fittedCount(part: PartDto): number {
  return part.units.filter((unit) => unit.fitted).length;
}

/** Units neither on a quad nor broken — what could go on one today. */
export function availableUnits(part: PartDto): number {
  return part.units.filter(unitIsFittable).length;
}

export function isFittable(part: PartDto): boolean {
  return availableUnits(part) > 0;
}

/**
 * How many units are in each condition.
 *
 * A part no longer has *a* condition, so the card summarises: three
 * serviceable and one broken is the honest reading of a 4-pack with one dead
 * motor, and was exactly what a single status field could not say.
 */
export function conditionCounts(part: PartDto): readonly [PartCondition, number][] {
  const counts = new Map<PartCondition, number>();

  for (const unit of part.units) {
    counts.set(unit.condition, (counts.get(unit.condition) ?? 0) + 1);
  }

  // Fixed order, so the same part never reshuffles its own summary.
  return (Object.values(PartCondition) as PartCondition[])
    .filter((condition) => counts.has(condition))
    .map((condition) => [condition, counts.get(condition) ?? 0]);
}

/**
 * A unit's number within its part, 1-based.
 *
 * Units are ordered by creation on the server, so "#3" means the same object
 * every time. A label the owner has written on the item wins over the number.
 */
export function unitName(part: PartDto, unit: PartUnitDto): string {
  if (unit.label) {
    return unit.label;
  }

  const index = part.units.findIndex((candidate) => candidate.id === unit.id);

  return `#${index + 1}`;
}

/**
 * What a part is called. Manufacturer and model are both optional, so it
 * falls back to the category rather than listing anything nameless.
 */
export function partName(part: PartDto): string {
  const named = [part.manufacturer, part.model].filter(Boolean).join(' ');
  return named || PART_CATEGORY_LABELS[part.category];
}

/** Every free, serviceable unit across the inventory, ready for a picker. */
export function fittableUnits(parts: readonly PartDto[]): readonly FittableUnit[] {
  const result: FittableUnit[] = [];

  for (const part of parts) {
    const named = [part.manufacturer, part.model].filter(Boolean).join(' ');

    for (const unit of part.units) {
      if (!unitIsFittable(unit)) {
        continue;
      }

      result.push({
        unitId: unit.id,
        partId: part.id,
        label: `${named || 'Unnamed part'} ${unitName(part, unit)}`,
        part,
      });
    }
  }

  return result;
}
