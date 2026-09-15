import type { LogImportDto } from '@spothub/shared';

import type { LogImportEntity } from './flight-log.entity';

export function toLogImportDto(batch: LogImportEntity): LogImportDto {
  return {
    id: batch.id,
    status: batch.status,
    buildId: batch.buildId,
    flightCount: batch.flightCount,
    error: batch.error,
    createdAt: batch.createdAt.toISOString(),
    finishedAt: batch.finishedAt?.toISOString() ?? null,
    files: batch.files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      status: file.status,
      flightCount: file.flightCount,
      error: file.error,
    })),
  };
}
