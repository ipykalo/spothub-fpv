import { createHash } from 'node:crypto';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { LogFileStatus, LogImportStatus, MAX_LOG_BYTES } from '@spothub/shared';
import { z } from 'zod';

import { JobQueue } from '../jobs';
import { StorageGateway } from '../storage';
import { FlightLogsRepository } from './abstract/flight-logs.repository';
import { FlightsRepository } from './abstract/flights.repository';
import { LogParseError, parseEdgeTxCsv } from './edgetx-csv.parser';
import type { LogFileEntity } from './entities/flight-log.entity';
import { FLIGHT_LOG_IMPORT_JOB, SESSION_GAP_MS } from './flights.constants';

const payloadSchema = z.object({ importId: z.uuid(), ownerId: z.uuid() });

/** A log that cannot be imported as uploaded. Fails that file, not the batch. */
class RejectedLog extends Error {}

/**
 * Parses a batch of uploaded logs into flights, in the background.
 *
 * Idempotent, because the queue retries: a file already parsed is skipped,
 * and a flight already stored is not stored twice. A file that is simply not
 * a readable log fails on its own and the rest carry on; anything unexpected —
 * the database or storage going away — fails the whole attempt, so the job is
 * retried rather than half the batch being written off.
 */
@Injectable()
export class FlightLogWorker implements OnModuleInit {
  private readonly logger = new Logger(FlightLogWorker.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly logs: FlightLogsRepository,
    private readonly flights: FlightsRepository,
    private readonly storage: StorageGateway,
  ) {}

  onModuleInit(): void {
    this.jobs.register(FLIGHT_LOG_IMPORT_JOB, (payload) => this.run(payload));
  }

  private async run(payload: Readonly<Record<string, unknown>>): Promise<void> {
    const { importId, ownerId } = payloadSchema.parse(payload);
    const batch = await this.logs.findImport(ownerId, importId);

    if (!batch || batch.status === LogImportStatus.Done) {
      return;
    }

    await this.logs.markImportRunning(ownerId, importId);

    // A build chosen for the batch wins; it may have been deleted since.
    const chosenBuild =
      batch.buildId !== null &&
      (await this.flights.buildBelongsToOwner(ownerId, batch.buildId))
        ? batch.buildId
        : null;
    const buildByModel = new Map<string, string | null>();

    let flightCount = 0;
    let failed = 0;

    try {
      for (const file of batch.files) {
        if (file.status === LogFileStatus.Parsed) {
          flightCount += file.flightCount;
          continue;
        }

        try {
          flightCount += await this.importFile(ownerId, file, chosenBuild, buildByModel);
        } catch (error) {
          if (!(error instanceof RejectedLog || error instanceof LogParseError)) {
            throw error;
          }

          failed += 1;
          await this.logs.recordFileResult(ownerId, file.id, {
            status: LogFileStatus.Failed,
            modelName: null,
            flightCount: 0,
            error: error.message,
          });
        }
      }
    } catch (error) {
      // Visible to the client now; the queue will try the batch again.
      await this.logs.finishImport(ownerId, importId, {
        status: LogImportStatus.Failed,
        flightCount,
        error: 'The import stopped on an unexpected error and will be retried',
      });
      throw error;
    }

    const total = batch.files.length;

    await this.logs.finishImport(ownerId, importId, {
      status:
        total > 0 && failed === total ? LogImportStatus.Failed : LogImportStatus.Done,
      flightCount,
      error: failed > 0 ? `${failed} of ${total} logs could not be read` : null,
    });

    this.logger.log(
      `Import ${importId}: ${flightCount} flight(s) from ${total - failed} of ${total} log(s)`,
    );
  }

  /** Reads, verifies and parses one file. Answers how many flights were new. */
  private async importFile(
    ownerId: string,
    file: LogFileEntity,
    chosenBuild: string | null,
    buildByModel: Map<string, string | null>,
  ): Promise<number> {
    const stored = await this.storage.get(file.storageKey);

    if (!stored) {
      throw new RejectedLog('The upload never arrived');
    }

    // Re-checked against what actually landed, not what was declared.
    if (stored.sizeBytes > MAX_LOG_BYTES) {
      throw new RejectedLog('That log is larger than 25 MB');
    }

    const checksum = createHash('sha256').update(stored.body).digest('hex');

    if (checksum !== file.checksum) {
      throw new RejectedLog('What arrived is not the file that was announced');
    }

    const parsed = parseEdgeTxCsv(stored.body.toString('utf8'), file.fileName);
    const buildId =
      chosenBuild ?? (await this.buildForModel(ownerId, parsed.modelName, buildByModel));

    const added = await this.flights.addFlights(
      ownerId,
      parsed.flights.map((flight) => ({ ...flight, logFileId: file.id, buildId })),
      SESSION_GAP_MS,
    );

    await this.logs.recordFileResult(ownerId, file.id, {
      status: LogFileStatus.Parsed,
      modelName: parsed.modelName,
      flightCount: parsed.flights.length,
      error: null,
    });

    return added;
  }

  /**
   * The build named like the radio model, if there is exactly one such name.
   * Most pilots name the model on the radio after the quad, so this assigns
   * most flights with nobody choosing anything.
   */
  private async buildForModel(
    ownerId: string,
    modelName: string | null,
    cache: Map<string, string | null>,
  ): Promise<string | null> {
    if (modelName === null) {
      return null;
    }

    const key = modelName.toLowerCase();
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const buildId = await this.flights.findBuildIdByName(ownerId, modelName);
    cache.set(key, buildId);
    return buildId;
  }
}
