import type { ConfigDto, ConfigWithRawDto } from '@spothub/shared';

import type { ConfigEntity } from './config.entity';

/** Date-only columns must not leak a timezone-shifted timestamp to the client. */
const toDateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/**
 * The single place a domain entity becomes a wire object.
 *
 * Explicit rather than a spread, so a column added to the database is not
 * silently published by the API.
 */
export function toConfigDto(config: ConfigEntity): ConfigDto {
  return {
    id: config.id,
    buildId: config.buildId,
    capturedAt: config.capturedAt.toISOString(),
    kind: config.kind,
    note: config.note,
    fwTarget: config.fwTarget,
    fwVersion: config.fwVersion,
    fwBuildDate: toDateOnly(config.fwBuildDate),
    fwGitRev: config.fwGitRev,
    mspApi: config.mspApi,
    configRev: config.configRev,
    boardName: config.boardName,
    manufacturerId: config.manufacturerId,
    mcuId: config.mcuId,
    craftName: config.craftName,
  };
}

/** Only for a single capture: the list deliberately omits the text. */
export function toConfigWithRawDto(config: ConfigEntity): ConfigWithRawDto {
  return { ...toConfigDto(config), raw: config.raw ?? '' };
}
