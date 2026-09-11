import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreateLogImportDto,
  KnownLogsDto,
  KnownLogsResultDto,
  LogImportDto,
  LogUploadTicketDto,
  RequestLogUploadDto,
} from '@spothub/shared';

import type { Env } from '../../config';
import { JobQueue } from '../../jobs';
import { StorageGateway } from '../../storage';
import { FlightLogsRepository } from '../abstract/flight-logs.repository';
import { FlightsRepository } from '../abstract/flights.repository';
import { FLIGHT_LOG_IMPORT_JOB, LOG_CONTENT_TYPE } from '../flights.constants';
import { toLogImportDto } from '../flights.mapper';

/**
 * Getting logs in. Knows nothing about HTTP, Prisma or S3.
 *
 * The bytes never arrive in a request. The client learns which files are new,
 * PUTs those straight to storage on presigned URLs, and then starts an import,
 * which is queued and answered at once — the parsing happens in the worker.
 */
@Injectable()
export class FlightLogsService {
  private readonly uploadTtl: number;

  constructor(
    private readonly logs: FlightLogsRepository,
    private readonly flights: FlightsRepository,
    private readonly storage: StorageGateway,
    private readonly jobs: JobQueue,
    config: ConfigService<Env, true>,
  ) {
    this.uploadTtl = config.get('S3_UPLOAD_URL_TTL', { infer: true });
  }

  /**
   * Which of these files are already in.
   *
   * The whole LOGS folder is dropped every time, so without this every import
   * would re-upload a season of logs to find out they were all known.
   */
  async known(ownerId: string, input: KnownLogsDto): Promise<KnownLogsResultDto> {
    return { known: await this.logs.findParsedChecksums(ownerId, input.checksums) };
  }

  async requestUpload(
    ownerId: string,
    input: RequestLogUploadDto,
  ): Promise<LogUploadTicketDto> {
    // The key is ours, never the radio's file name.
    const file = await this.logs.reserveFile({
      ownerId,
      storageKey: `${ownerId}/logs/${randomUUID()}.csv`,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
    });

    if (!file) {
      throw new ConflictException('That log has already been imported');
    }

    const uploadUrl = await this.storage.presignPut(
      file.storageKey,
      LOG_CONTENT_TYPE,
      this.uploadTtl,
    );

    return {
      logFileId: file.id,
      uploadUrl,
      contentType: LOG_CONTENT_TYPE,
      expiresInSeconds: this.uploadTtl,
    };
  }

  /** Queues the batch and answers straight away. */
  async startImport(ownerId: string, input: CreateLogImportDto): Promise<LogImportDto> {
    if (
      input.buildId !== null &&
      !(await this.flights.buildBelongsToOwner(ownerId, input.buildId))
    ) {
      throw new NotFoundException('Build not found');
    }

    const batch = await this.logs.createImport(ownerId, input.buildId, input.logFileIds);

    if (!batch) {
      throw new BadRequestException('Some of those logs are not waiting to be imported');
    }

    await this.jobs.enqueue(FLIGHT_LOG_IMPORT_JOB, { importId: batch.id, ownerId });

    return toLogImportDto(batch);
  }

  async getImport(ownerId: string, id: string): Promise<LogImportDto> {
    const batch = await this.logs.findImport(ownerId, id);

    if (!batch) {
      throw new NotFoundException('Import not found');
    }

    return toLogImportDto(batch);
  }
}
