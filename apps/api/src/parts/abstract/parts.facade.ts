import type { PartDto, PartUnitDto } from '@spothub/shared';

/** A physical unit together with the kind of part it is one of. */
export interface FittedUnitDto {
  readonly unit: PartUnitDto;
  readonly part: PartDto;
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
   * absent from the result rather than an error.
   */
  abstract findUnits(
    ownerId: string,
    unitIds: readonly string[],
  ): Promise<ReadonlyMap<string, FittedUnitDto>>;

  /** True when the unit exists and belongs to this owner. */
  abstract unitExists(ownerId: string, unitId: string): Promise<boolean>;
}
