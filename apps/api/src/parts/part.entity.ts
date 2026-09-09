import type { PartCategory, PartCondition, PartSpec } from '@spothub/shared';

/** A source row as the domain understands it — `price` is a plain number. */
export interface PartSourceEntity {
  readonly id: string;
  readonly partId: string;
  readonly vendor: string | null;
  readonly url: string | null;
  readonly price: number | null;
  readonly currency: string | null;
  readonly isPurchase: boolean;
  readonly purchasedOn: Date | null;
  readonly quantity: number;
  readonly capturedAt: Date;
}

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

/** A *kind* of part as the domain understands it — no ORM types, no count. */
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

/** Fields the persistence layer accepts when adding a unit to a part. */
export interface CreatePartUnitData {
  readonly condition: PartCondition;
  readonly label: string | null;
  readonly acquiredOn: Date | null;
  readonly notes: string | null;
}

/** A sparse patch on a unit. Only the keys present are written. */
export type UpdatePartUnitData = Partial<CreatePartUnitData>;

/** A sparse patch. Only the keys present are written. */
export type UpdatePartData = Partial<Omit<CreatePartData, 'ownerId' | 'quantity'>>;

/** Fields the persistence layer accepts when adding a source to a part. */
export interface CreatePartSourceData {
  readonly vendor: string | null;
  readonly url: string | null;
  readonly price: number | null;
  readonly currency: string | null;
  readonly isPurchase: boolean;
  readonly purchasedOn: Date | null;
  readonly quantity: number;
}

/** A sparse patch on a source. Only the keys present are written. */
export type UpdatePartSourceData = Partial<CreatePartSourceData>;
