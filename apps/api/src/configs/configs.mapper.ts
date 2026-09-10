import type { ConfigDto, ConfigWithRawDto } from '@spothub/shared';

import { toNullableDateOnly } from '../common';
import type { ConfigEntity } from './config.entity';

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
    fwBuildDate: toNullableDateOnly(config.fwBuildDate),
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
