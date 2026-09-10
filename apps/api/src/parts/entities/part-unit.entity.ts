import type { PartCondition } from '@spothub/shared';

/** One physical unit as the domain understands it. */
export interface PartUnitEntity {
  readonly id: string;
  readonly partId: string;
  readonly condition: PartCondition;
  readonly label: string | null;
  readonly acquiredOn: Date | null;
  readonly notes: string | null;
  /** On a quad right now. Counted from `build_parts`, never stored. */
  readonly fitted: boolean;
  readonly createdAt: Date;
}

/** Fields the persistence layer accepts when adding a unit to a part. */
export interface CreatePartUnitData {
  readonly condition: PartCondition;
  readonly label: string | null;
  readonly acquiredOn: Date | null;
  readonly notes: string | null;
}

/** A sparse patch on a unit. Only the keys present are written. */
export type UpdatePartUnitData = Partial<CreatePartUnitData>;
