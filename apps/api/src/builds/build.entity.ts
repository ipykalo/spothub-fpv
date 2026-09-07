import type { BuildClass, BuildStatus, Visibility } from '@spothub/shared';

/** A build as the domain understands it — no ORM types. */
export interface BuildEntity {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly slug: string;
  readonly buildClass: BuildClass | null;
  readonly status: BuildStatus;
  readonly visibility: Visibility;
  readonly weightG: number | null;
  readonly hasGps: boolean;
  readonly descriptionMd: string | null;
  readonly builtOn: Date | null;
  readonly retiredOn: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fields the persistence layer accepts on create. */
export interface CreateBuildData {
  readonly ownerId: string;
  readonly slug: string;
  readonly name: string;
  readonly buildClass: BuildClass | null;
  readonly status: BuildStatus;
  readonly visibility: Visibility;
  readonly weightG: number | null;
  readonly hasGps: boolean;
  readonly descriptionMd: string | null;
  readonly builtOn: Date | null;
  readonly retiredOn: Date | null;
}

/** A sparse patch. Only the keys present are written. */
export type UpdateBuildData = Partial<Omit<CreateBuildData, 'ownerId' | 'slug'>>;
