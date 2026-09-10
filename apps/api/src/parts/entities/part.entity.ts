import type { PartCategory, PartSpec } from '@spothub/shared';

import type { PartSourceEntity } from './part-source.entity';
import type { PartUnitEntity } from './part-unit.entity';

/**
 * A *kind* of part as the domain understands it — no ORM types, no count.
 *
 * Units and sources are embedded rather than fetched separately: they are
 * children of this aggregate, which is why they share a module with it.
 */
export interface PartEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly category: PartCategory;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly spec: PartSpec;
  readonly notesMd: string | null;
  readonly units: readonly PartUnitEntity[];
  readonly sources: readonly PartSourceEntity[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fields the persistence layer accepts on create. */
export interface CreatePartData {
  readonly ownerId: string;
  readonly category: PartCategory;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly spec: PartSpec;
  readonly notesMd: string | null;
  /** How many units to create alongside the part. At least one. */
  readonly quantity: number;
}

/** A sparse patch. Only the keys present are written. */
export type UpdatePartData = Partial<Omit<CreatePartData, 'ownerId' | 'quantity'>>;
