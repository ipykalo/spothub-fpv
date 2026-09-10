import type { RepairCause } from '@spothub/shared';

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
