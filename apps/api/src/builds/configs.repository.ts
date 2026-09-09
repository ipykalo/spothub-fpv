import type { ConfigEntity, CreateConfigData } from './config.entity';

/**
 * Persistence contract for firmware captures.
 *
 * `ownerId` comes first on every method, as everywhere else. Captures are
 * reached through their build, so the ownership check runs against the parent.
 */
export abstract class ConfigsRepository {
  /** Without `raw`: a list of captures should not ship a dump each. */
  abstract findManyForOwner(ownerId: string, buildId: string): Promise<ConfigEntity[]>;

  /** With `raw`, for viewing or diffing. */
  abstract findOneForOwner(
    ownerId: string,
    buildId: string,
    configId: string,
  ): Promise<ConfigEntity | null>;

  abstract create(ownerId: string, data: CreateConfigData): Promise<ConfigEntity | null>;

  abstract updateNoteForOwner(
    ownerId: string,
    buildId: string,
    configId: string,
    note: string | null,
  ): Promise<ConfigEntity | null>;

  abstract deleteForOwner(
    ownerId: string,
    buildId: string,
    configId: string,
  ): Promise<boolean>;
}
