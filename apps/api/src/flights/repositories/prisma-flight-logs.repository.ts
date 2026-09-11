import { Injectable } from '@nestjs/common';
import {
  type LogFile,
  LogFileStatus,
  type LogImport,
  LogImportStatus,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma';
import { FlightLogsRepository } from '../abstract/flight-logs.repository';
import type {
  LogFileEntity,
  LogFileResult,
  LogImportEntity,
  LogImportResult,
  ReserveLogFileData,
} from '../entities/flight-log.entity';

const WITH_FILES = {
  files: { orderBy: { fileName: 'asc' } },
} satisfies Prisma.LogImportInclude;

type LogImportWithFiles = LogImport & { files: LogFile[] };

/**
 * A log counts as imported while something from it is still in the logbook —
 * or when it never held a flight at all, so a log of bench time is not
 * re-uploaded on every drop.
 *
 * Delete every flight a log gave and it can be imported again, which is what
 * someone clearing out an import and redoing it expects. Delete only some and
 * the rest keep it imported, so the ones deleted as "not really a flight" stay
 * deleted the next time the whole folder is dropped.
 */
const STILL_IMPORTED = {
  status: LogFileStatus.PARSED,
  OR: [{ flightCount: 0 }, { flights: { some: {} } }],
} satisfies Prisma.LogFileWhereInput;

/** The only place log files and imports meet Prisma. */
@Injectable()
export class PrismaFlightLogsRepository extends FlightLogsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findImportedChecksums(
    ownerId: string,
    checksums: readonly string[],
  ): Promise<string[]> {
    if (checksums.length === 0) {
      return [];
    }

    const rows = await this.prisma.logFile.findMany({
      where: { ownerId, checksum: { in: [...checksums] }, ...STILL_IMPORTED },
      select: { checksum: true },
    });

    return rows.map((row) => row.checksum);
  }

  async reserveFile(data: ReserveLogFileData): Promise<LogFileEntity | null> {
    const existing = await this.prisma.logFile.findUnique({
      where: { ownerId_checksum: { ownerId: data.ownerId, checksum: data.checksum } },
    });

    if (existing) {
      const stillImported = await this.prisma.logFile.count({
        where: { id: existing.id, ...STILL_IMPORTED },
      });

      if (stillImported > 0) {
        return null;
      }
    }

    // An earlier attempt that never finished keeps its row and its key, and
    // so does a log whose flights were all deleted: the upload simply goes
    // into it again, and the worker parses it afresh.
    const row = existing
      ? await this.prisma.logFile.update({
          where: { id: existing.id },
          data: {
            status: LogFileStatus.PENDING,
            importId: null,
            fileName: data.fileName,
            sizeBytes: data.sizeBytes,
            flightCount: 0,
            error: null,
          },
        })
      : await this.prisma.logFile.create({ data: { ...data } });

    return toFileEntity(row);
  }

  async createImport(
    ownerId: string,
    buildId: string | null,
    fileIds: readonly string[],
  ): Promise<LogImportEntity | null> {
    const ids = [...new Set(fileIds)];

    const created = await this.prisma.$transaction(async (tx) => {
      const waiting = await tx.logFile.count({
        where: {
          id: { in: ids },
          ownerId,
          status: LogFileStatus.PENDING,
          importId: null,
        },
      });

      if (waiting !== ids.length) {
        return null;
      }

      const batch = await tx.logImport.create({ data: { ownerId, buildId } });

      await tx.logFile.updateMany({
        where: { id: { in: ids }, ownerId },
        data: { importId: batch.id },
      });

      return tx.logImport.findUniqueOrThrow({
        where: { id: batch.id },
        include: WITH_FILES,
      });
    });

    return created ? toImportEntity(created) : null;
  }

  async findImport(ownerId: string, id: string): Promise<LogImportEntity | null> {
    const found = await this.prisma.logImport.findFirst({
      where: { id, ownerId },
      include: WITH_FILES,
    });

    return found ? toImportEntity(found) : null;
  }

  async markImportRunning(ownerId: string, id: string): Promise<void> {
    await this.prisma.logImport.updateMany({
      where: { id, ownerId },
      data: { status: LogImportStatus.RUNNING, error: null },
    });
  }

  async recordFileResult(
    ownerId: string,
    fileId: string,
    result: LogFileResult,
  ): Promise<void> {
    await this.prisma.logFile.updateMany({
      where: { id: fileId, ownerId },
      data: {
        status: result.status,
        modelName: result.modelName,
        flightCount: result.flightCount,
        error: result.error,
      },
    });
  }

  async finishImport(
    ownerId: string,
    id: string,
    result: LogImportResult,
  ): Promise<void> {
    await this.prisma.logImport.updateMany({
      where: { id, ownerId },
      data: {
        status: result.status,
        flightCount: result.flightCount,
        error: result.error,
        finishedAt: new Date(),
      },
    });
  }
}

function toFileEntity(row: LogFile): LogFileEntity {
  return {
    id: row.id,
    ownerId: row.ownerId,
    importId: row.importId,
    status: row.status,
    storageKey: row.storageKey,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    modelName: row.modelName,
    flightCount: row.flightCount,
    error: row.error,
    createdAt: row.createdAt,
  };
}

function toImportEntity(row: LogImportWithFiles): LogImportEntity {
  return {
    id: row.id,
    ownerId: row.ownerId,
    buildId: row.buildId,
    status: row.status,
    flightCount: row.flightCount,
    error: row.error,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    files: row.files.map(toFileEntity),
  };
}
