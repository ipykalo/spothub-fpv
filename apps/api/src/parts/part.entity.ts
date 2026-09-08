import type { PartCategory, PartSpec, PartStatus } from '@spothub/shared';

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

/** A part as the domain understands it — no ORM types. */
export interface PartEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly category: PartCategory;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly spec: PartSpec;
  readonly quantityOwned: number;
  readonly status: PartStatus;
  readonly notesMd: string | null;
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
  readonly quantityOwned: number;
  readonly status: PartStatus;
  readonly notesMd: string | null;
}

/** A sparse patch. Only the keys present are written. */
export type UpdatePartData = Partial<Omit<CreatePartData, 'ownerId'>>;

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
