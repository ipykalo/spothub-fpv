import type { RepairCause } from '@spothub/shared';

/**
 * What a build says about who may read it and whether what its repairs cost
 * travels with it. A join on `builds` inside this module's own repository.
 */
export interface BuildAccess {
  readonly ownerId: string;
  readonly shareCosts: boolean;
}

/** A repair as the domain understands it — no ORM types, `cost` a number. */
export interface RepairEntity {
  readonly id: string;
  readonly buildId: string;
  readonly occurredOn: Date;
  readonly cause: RepairCause;
  readonly descriptionMd: string | null;
  readonly cost: number | null;
  readonly currency: string | null;
  /** Parts fitted as part of this repair. */
  readonly installCount: number;
  readonly createdAt: Date;
}

/** Fields the persistence layer accepts on create. */
export interface CreateRepairData {
  readonly buildId: string;
  readonly occurredOn: Date;
  readonly cause: RepairCause;
  readonly descriptionMd: string | null;
  readonly cost: number | null;
  readonly currency: string | null;
}

/** A sparse patch. Only the keys present are written. */
export type UpdateRepairData = Partial<Omit<CreateRepairData, 'buildId'>>;
