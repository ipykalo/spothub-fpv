import type { PartUnitDto } from '@spothub/shared';

import { toNullableDateOnly } from '../../common';
import type { PartUnitEntity } from '../entities/part-unit.entity';

/**
 * The single place a unit becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 */
export function toPartUnitDto(unit: PartUnitEntity): PartUnitDto {
  return {
    id: unit.id,
    partId: unit.partId,
    condition: unit.condition,
    label: unit.label,
    acquiredOn: toNullableDateOnly(unit.acquiredOn),
    notes: unit.notes,
    fitted: unit.fitted,
    createdAt: unit.createdAt.toISOString(),
  };
}
