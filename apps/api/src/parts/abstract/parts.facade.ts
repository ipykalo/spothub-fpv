import type { PartCategory, PartDto, PartUnitDto } from '@spothub/shared';

/** A physical unit together with the kind of part it is one of. */
export interface FittedUnitDto {
  readonly unit: PartUnitDto;
  readonly part: PartDto;
}

/** A part to add to the inventory with this many units, for a caller about to fit them. */
export interface NewPartWithUnits {
  readonly category: PartCategory;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly quantity: number;
}

/**
 * The parts module's public API — the only thing another module may inject.
 *
 * It answers in DTOs rather than entities on purpose. A consumer that took
 * `PartEntity` would be coupled to how parts are stored; one that takes
 * `PartDto` is coupled only to the contract in `@spothub/shared`, which both
 * sides of the wire already share.
 */
export abstract class PartsFacade {
  /**
   * Loads the given units with their parts, for a caller that holds unit ids
   * and needs to render them.
   *
   * Batched, and scoped to the owner: ids that are not theirs are simply
   * absent from the result rather than an error. With `convertInto` — a
   * viewer's home currency — every source price comes converted into it and
   * USD, for a page that shows the prices.
   */
  abstract findUnits(
    ownerId: string,
    unitIds: readonly string[],
    convertInto?: string,
  ): Promise<ReadonlyMap<string, FittedUnitDto>>;

  /** True when the unit exists and belongs to this owner. */
  abstract unitExists(ownerId: string, unitId: string): Promise<boolean>;

  /**
   * Adds parts to the owner's inventory, each with its units, in one
   * transaction: all of them or none. Answered in the order given.
   */
  abstract createWithUnits(
    ownerId: string,
    parts: readonly NewPartWithUnits[],
  ): Promise<PartDto[]>;

  /**
   * Takes back parts this caller just created, when what it meant to do with
   * them failed — so a half-done batch leaves nothing on the shelf.
   */
  abstract deleteParts(ownerId: string, partIds: readonly string[]): Promise<void>;
}
