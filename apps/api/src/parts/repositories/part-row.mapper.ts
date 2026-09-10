import { type Part, type PartSource, type PartUnit, Prisma } from '@prisma/client';
import type { PartSpec } from '@spothub/shared';

import type { PartSourceEntity } from '../entities/part-source.entity';
import type { PartUnitEntity } from '../entities/part-unit.entity';
import type { PartEntity } from '../entities/part.entity';

export type UnitWithInstalls = PartUnit & { _count: { installs: number } };

export type PartWithRelations = Part & {
  sources: PartSource[];
  units: UnitWithInstalls[];
};

/**
 * A unit is fitted when it has an install still open. Counting them in the
 * same query beats a second round trip per unit, and keeps "is it fitted"
 * derived rather than stored.
 *
 * It reads `build_parts`, which another module owns — a join, not a
 * dependency. The alternative is a call per unit.
 */
export const FITTED_COUNT = {
  _count: { select: { installs: { where: { removedOn: null } } } },
} satisfies Prisma.PartUnitInclude;

export const WITH_RELATIONS = {
  sources: true,
  units: {
    include: FITTED_COUNT,
    // Stable order so a unit keeps the same position in the list it is
    // numbered by on screen.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.PartInclude;

/**
 * Row → entity, in one place for all three parts repositories.
 *
 * Lives under `repositories/` because it is the only thing besides those
 * repositories allowed to name a Prisma type: `Decimal` must not escape this
 * layer, and this is where it is converted.
 */
export function toPartEntity(part: PartWithRelations): PartEntity {
  return {
    id: part.id,
    ownerId: part.ownerId,
    category: part.category,
    manufacturer: part.manufacturer,
    model: part.model,
    spec: (part.spec ?? {}) as PartSpec,
    notesMd: part.notesMd,
    units: part.units.map(toPartUnitEntity),
    sources: part.sources.map(toPartSourceEntity),
    createdAt: part.createdAt,
    updatedAt: part.updatedAt,
  };
}

export function toPartUnitEntity(unit: UnitWithInstalls): PartUnitEntity {
  return {
    id: unit.id,
    partId: unit.partId,
    condition: unit.condition,
    label: unit.label,
    acquiredOn: unit.acquiredOn,
    notes: unit.notes,
    fitted: unit._count.installs > 0,
    createdAt: unit.createdAt,
  };
}

/** `Decimal` is a Prisma type and must not escape this layer. */
export function toPartSourceEntity(source: PartSource): PartSourceEntity {
  return {
    id: source.id,
    partId: source.partId,
    vendor: source.vendor,
    url: source.url,
    price: source.price === null ? null : source.price.toNumber(),
    currency: source.currency,
    isPurchase: source.isPurchase,
    purchasedOn: source.purchasedOn,
    quantity: source.quantity,
    capturedAt: source.capturedAt,
  };
}
