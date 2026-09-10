import type {
  CreatePartSourceData,
  PartSourceEntity,
  UpdatePartSourceData,
} from '../entities/part-source.entity';

/**
 * Persistence contract for price sources.
 *
 * Sources are reached through their parent part, so `ownerId` is checked
 * against that parent rather than against the source row.
 */
export abstract class PartSourcesRepository {
  abstract addForOwner(
    ownerId: string,
    partId: string,
    data: CreatePartSourceData,
  ): Promise<PartSourceEntity | null>;

  abstract updateForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
    data: UpdatePartSourceData,
  ): Promise<PartSourceEntity | null>;

  abstract deleteForOwner(
    ownerId: string,
    partId: string,
    sourceId: string,
  ): Promise<boolean>;
}
